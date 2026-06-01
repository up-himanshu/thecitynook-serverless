import { APIGatewayProxyEvent } from 'aws-lambda';
import moment from 'moment';
import { getStayboardModels } from '../../data/stayboard';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';
import { sendPushNotifications } from '../../utils/stayboard/push';

const {
  HousekeepingTask: StayboardHousekeepingTask,
  Device: StayboardDevice,
  User: StayboardUser,
} = getStayboardModels();

const normalizeTaskStatus = (status: string) =>
  status === 'finished' ? 'completed' : status;
const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const listTasksHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');

  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const dueDate = String(event.queryStringParameters?.date || moment().format('YYYY-MM-DD'));

  const statusFilter = token.role === 'housekeeping'
    ? { $in: ['pending', 'in_progress', 'completed', 'finished'] }
    : { $in: ['pending', 'in_progress', 'completed', 'finished', 'skipped'] };

  const tasksRaw = await StayboardHousekeepingTask.find({
    ownerId,
    dueDate,
    isActive: { $ne: false },
    status: statusFilter,
  }).sort({ createdAt: 1 });
  const tasks = tasksRaw.map((task: any) => ({
    ...task.toObject(),
    status: normalizeTaskStatus(task.status),
  }));

  return appResponse(200, { tasks, dueDate });
};

export const startTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const taskId = event.pathParameters?.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const task = await StayboardHousekeepingTask.findOne({ _id: taskId, isActive: { $ne: false } });
  if (!task) return appResponse(404, {}, 'Task not found');
  const taskStatus = normalizeTaskStatus(task.status);
  if (taskStatus === 'completed' || taskStatus === 'skipped') {
    return appResponse(400, {}, 'Task cannot be started from current status');
  }

  if (taskStatus === 'in_progress' && String(task.startedById || '') !== String(token.userId)) {
    return appResponse(409, {}, 'Task already started by another user');
  }

  if (taskStatus === 'pending') {
    task.status = 'in_progress';
    task.taskStartedAt = new Date();
    task.startedById = token.userId;
    await task.save();

    try {
      const [staffUser, ownerUsers] = await Promise.all([
        StayboardUser.findById(token.userId).select('displayName fullName'),
        StayboardUser.find({
          role: 'owner',
          $or: [{ _id: task.ownerId }, { ownerId: task.ownerId }],
        }).select('_id'),
      ]);
      const staffName = staffUser?.displayName || staffUser?.fullName || 'A staff member';
      const ownerIds = ownerUsers.map((owner) => String(owner._id));
      if (ownerIds.length) {
        const ownerDevices = await StayboardDevice.find({ userId: { $in: ownerIds } });
        await sendPushNotifications(
          ownerDevices.map((d) => d.pushToken),
          'Housekeeping started',
          `${staffName} has started housekeeping on property ${task.roomName}`,
        );
      }
    } catch (error) {
      console.error('Unable to send owner start push notifications:', error);
    }
  }

  return appResponse(200, { task }, 'Task started');
};

export const submitTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (!event.body) return appResponse(400, {}, 'Missing request body');

  const parsedBody = JSON.parse(event.body);
  const taskId = event.pathParameters?.taskId || parsedBody.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const { checklist, remarks } = parsedBody;
  if (!Array.isArray(checklist) || !checklist.length) {
    return appResponse(400, {}, 'Checklist is required');
  }
  if (checklist.some((x) => x.answer !== 'yes' && x.answer !== 'no')) {
    return appResponse(400, {}, 'All checklist items must be answered yes/no');
  }

  const existingTask = await StayboardHousekeepingTask.findOne({ _id: taskId, isActive: { $ne: false } });
  if (!existingTask) return appResponse(404, {}, 'Task not found');

  const existingTaskStatus = normalizeTaskStatus(existingTask.status);
  if (existingTaskStatus === 'skipped') {
    return appResponse(400, {}, 'Skipped task cannot be submitted');
  }
  if (existingTaskStatus === 'completed') {
    return appResponse(400, {}, 'Task already completed');
  }
  if (existingTaskStatus === 'in_progress' && String(existingTask.startedById || '') !== String(token.userId)) {
    return appResponse(409, {}, 'Task is in progress by another user');
  }

  const now = new Date();
  const startedAt = toDate(existingTask.taskStartedAt) || now;
  const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

  const task = await StayboardHousekeepingTask.findOneAndUpdate(
    { _id: taskId, isActive: { $ne: false } },
    {
      checklist,
      remarks,
      status: 'completed',
      completedById: token.userId,
      taskCompletedAt: now,
      durationMinutes,
    },
    { new: true },
  );

  if (!task) return appResponse(404, {}, 'Task not found');

  try {
    const [staffUser, ownerUsers] = await Promise.all([
      StayboardUser.findById(token.userId).select('displayName fullName'),
      StayboardUser.find({
        role: 'owner',
        $or: [{ _id: task.ownerId }, { ownerId: task.ownerId }],
      }).select('_id'),
    ]);
    const staffName = staffUser?.displayName || staffUser?.fullName || 'A staff member';
    const ownerIds = ownerUsers.map((owner) => String(owner._id));
    const ownerDevices = ownerIds.length
      ? await StayboardDevice.find({ userId: { $in: ownerIds } })
      : [];
    await sendPushNotifications(
      ownerDevices.map((d) => d.pushToken),
      'Housekeeping completed',
      `${staffName} has completed housekeeping on property ${task.roomName}`,
    );
  } catch (error) {
    console.error('Unable to send owner completion push notifications:', error);
  }

  return appResponse(200, { task }, 'Task completed');
};

export const skipTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');
  const taskId = event.pathParameters?.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const task = await StayboardHousekeepingTask.findOneAndUpdate(
    { _id: taskId, isActive: { $ne: false } },
    { status: 'skipped' },
    { new: true },
  );
  if (!task) return appResponse(404, {}, 'Task not found');

  return appResponse(200, { task }, 'Task skipped');
};

export const deleteTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');

  const taskId = event.pathParameters?.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const task = await StayboardHousekeepingTask.findOneAndUpdate(
    {
      _id: taskId,
      ownerId: token.userId,
      isActive: { $ne: false },
    },
    {
      isActive: false,
      status: 'skipped',
    },
    { new: true },
  );

  if (!task) return appResponse(404, {}, 'Task not found');

  return appResponse(200, { task }, 'Task deleted');
};

export const dailyReminderHandler = async () => {
  const dueDate = moment.utc().format('YYYY-MM-DD');

  const staffUsers = await StayboardUser.find({ role: 'housekeeping' }).select('_id ownerId');
  for (const staffUser of staffUsers) {
    const ownerId = String(staffUser.ownerId || '');
    if (!ownerId) continue;

    const dueCount = await StayboardHousekeepingTask.countDocuments({
      ownerId,
      dueDate,
      isActive: { $ne: false },
      status: { $in: ['pending', 'in_progress'] },
    });
    if (!dueCount) continue;

    const staffDevices = await StayboardDevice.find({ userId: String(staffUser._id) });
    if (!staffDevices.length) continue;

    await sendPushNotifications(
      staffDevices.map((d) => d.pushToken),
      'Housekeeping reminder',
      `You have ${dueCount} housekeeping tasks due today.`,
    );
  }

  return appResponse(200, { dueDate }, 'Daily housekeeping reminders processed');
};
