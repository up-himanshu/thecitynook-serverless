import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const client = new S3Client({
  region: process.env.STAYBOARD_AWS_REGION || 'ap-south-1',
  credentials: process.env.STAYBOARD_AWS_ACCESS_KEY_ID && process.env.STAYBOARD_AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.STAYBOARD_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.STAYBOARD_AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export const uploadGuestIdPhoto = async (buffer: Buffer, ownerId: string) => {
  const resized = await sharp(buffer).jpeg({ quality: 55, mozjpeg: true }).toBuffer();
  const key = `stayboard/${ownerId}/${Date.now()}-id.jpg`;
  const bucket = process.env.STAYBOARD_S3_BUCKET as string;

  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: resized, ContentType: 'image/jpeg' }));
  return `https://${bucket}.s3.${process.env.STAYBOARD_AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
};
