import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: process.env.STAYBOARD_AWS_REGION || "ap-south-1",
  credentials:
    process.env.STAYBOARD_AWS_ACCESS_KEY_ID &&
    process.env.STAYBOARD_AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.STAYBOARD_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.STAYBOARD_AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export const uploadGuestIdPhoto = async (
  buffer: Buffer,
  ownerId: string,
  bookingId: string,
  suffix = 1,
) => {
  let body = buffer;
  try {
    // Load sharp lazily so Lambda can still boot if native sharp binary is unavailable.
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const sharp = require("sharp");
    body = await sharp(buffer).jpeg({ quality: 55, mozjpeg: true }).toBuffer();
  } catch (error) {
    console.warn("Sharp unavailable, uploading original image buffer:", error);
  }

  const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(istDate.getUTCDate()).padStart(2, "0");
  const hh = String(istDate.getUTCHours()).padStart(2, "0");
  const min = String(istDate.getUTCMinutes()).padStart(2, "0");
  const sec = String(istDate.getUTCSeconds()).padStart(2, "0");
  const timestampIst = `${yyyy}${mm}${dd}${hh}${min}${sec}`;
  const key = `${ownerId}/${bookingId}/${timestampIst}_${suffix}.jpeg`;
  const bucket = process.env.STAYBOARD_S3_BUCKET as string;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/jpeg",
    }),
  );
  return `https://${bucket}.s3.${process.env.STAYBOARD_AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`;
};
