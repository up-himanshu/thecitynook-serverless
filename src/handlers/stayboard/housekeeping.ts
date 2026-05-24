import { APIGatewayProxyEvent } from 'aws-lambda';
import moment from 'moment';
import StayboardHousekeepingTask from '../../models/stayboard/HousekeepingTask';
import StayboardDevice from '../../models/stayboard/Device';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';
import { sendPushNotifications } from '../../utils/stayboard/push';

export const listTasksHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');

  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const dueDate = String(event.queryStringParameters?.date || moment().format('YYYY-MM-DD'));

  const statusFilter = token.role === 'housekeeping'
    ? { $in: ['pending', 'in_progress', 'completed'] }
    : { $in: ['pending', 'in_progress', 'completed', 'skipped'] };

  const tasks = await StayboardHousekeepingTask.find({
    ownerId,
    dueDate,
    status: statusFilter,
  }).sort({ createdAt: 1 });

  return appResponse(200, { tasks, dueDate });
};

export const startTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const taskId = event.pathParameters?.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const task = await StayboardHousekeepingTask.findById(taskId);
  if (!task) return appResponse(404, {}, 'Task not found');
  if (task.status === 'completed' || task.status === 'skipped') {
    return appResponse(400, {}, 'Task cannot be started from current status');
  }

  if (task.status === 'in_progress' && String(task.startedById || '') !== String(token.userId)) {
    return appResponse(409, {}, 'Task already started by another user');
  }

  if (task.status === 'pending') {
    task.status = 'in_progress';
    task.taskStartedAt = new Date();
    task.startedById = token.userId;
    await task.save();
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

  const existingTask = await StayboardHousekeepingTask.findById(taskId);
  if (!existingTask) return appResponse(404, {}, 'Task not found');

  if (existingTask.status === 'skipped') {
    return appResponse(400, {}, 'Skipped task cannot be submitted');
  }
  if (existingTask.status === 'completed') {
    return appResponse(400, {}, 'Task already completed');
  }
  if (existingTask.status === 'in_progress' && String(existingTask.startedById || '') !== String(token.userId)) {
    return appResponse(409, {}, 'Task is in progress by another user');
  }

  const now = new Date();
  const startedAt = existingTask.taskStartedAt || now;
  const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

  const task = await StayboardHousekeepingTask.findByIdAndUpdate(
    taskId,
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

  const ownerDevices = await StayboardDevice.find({});
  try {
    await sendPushNotifications(
      ownerDevices.map((d) => d.pushToken),
      'Housekeeping completed',
      `${task.roomName} cleaned and checklist submitted`,
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

  const task = await StayboardHousekeepingTask.findByIdAndUpdate(
    taskId,
    { status: 'skipped' },
    { new: true },
  );
  if (!task) return appResponse(404, {}, 'Task not found');

  return appResponse(200, { task }, 'Task skipped');
};
