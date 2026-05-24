import { APIGatewayProxyEvent } from 'aws-lambda';
import StayboardHousekeepingTask from '../../models/stayboard/HousekeepingTask';
import StayboardBooking from '../../models/stayboard/Booking';
import StayboardDevice from '../../models/stayboard/Device';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';
import { sendPushNotifications } from '../../utils/stayboard/push';

export const listTasksHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');

  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const tasks = await StayboardHousekeepingTask.find({ ownerId, status: { $in: ['pending', 'in_progress'] } }).sort({ createdAt: 1 });
  return appResponse(200, { tasks });
};

export const startTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const taskId = event.pathParameters?.taskId;
  if (!taskId) return appResponse(400, {}, 'taskId is required');

  const task = await StayboardHousekeepingTask.findById(taskId);
  if (!task) return appResponse(404, {}, 'Task not found');

  if (task.status === 'pending') {
    task.status = 'in_progress';
    task.startedAt = new Date();
    task.startedBy = token.userId;
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

  const now = new Date();
  const startedAt = existingTask.startedAt || now;
  const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

  const task = await StayboardHousekeepingTask.findByIdAndUpdate(
    taskId,
    {
      checklist,
      remarks,
      status: 'completed',
      completedBy: token.userId,
      completedAt: now,
      durationMinutes,
    },
    { new: true },
  );

  if (!task) return appResponse(404, {}, 'Task not found');

  await StayboardBooking.findByIdAndUpdate(task.bookingId, { status: 'completed' });
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
