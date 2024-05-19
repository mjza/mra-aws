import AWS from 'aws-sdk';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const { S3 } = AWS;
const s3 = new S3();
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';

export const handler = async (event) => {
    const { bucket, key } = event;
    const tempVideoPath = `/tmp/${path.basename(key)}`;
    const videoExt = path.extname(key);
    const baseName = path.basename(key, videoExt);

    // Download video from S3
    const videoParams = { Bucket: bucket, Key: key };
    const video = await s3.getObject(videoParams).promise();
    fs.writeFileSync(tempVideoPath, video.Body);

    // Generate thumbnails based on orientation
    const thumbnailSizes = [
        { suffix: '-xs.webp', size: '320x240' },
        { suffix: '-sm.webp', size: '640x480' },
        { suffix: '-md.webp', size: '800x600' },
        { suffix: '-lg.webp', size: '1024x768' },
        { suffix: '-xl.webp', size: '1280x960' },
    ];

    try {
        // Get video orientation
        const orientation = execSync(`${ffprobePath} -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${tempVideoPath}`).toString();
        const [width, height] = orientation.split('x').map(Number);
        const isVertical = height > width;

        for (const { suffix, size } of thumbnailSizes) {
            const [w, h] = size.split('x').map(Number);
            const thumbnailSize = isVertical ? `${h}x${w}` : size;
            const thumbnailPath = `/tmp/${baseName}${suffix}`;

            execSync(`${ffmpegPath} -i ${tempVideoPath} -vf "thumbnail,scale=${thumbnailSize}" -frames:v 1 ${thumbnailPath}`);

            const thumbnailData = fs.readFileSync(thumbnailPath);
            const thumbnailKey = key.replace(`-org${videoExt}`, suffix);

            await s3.putObject({
                Bucket: bucket,
                Key: thumbnailKey,
                Body: thumbnailData,
                ContentType: 'image/webp'
            }).promise();

            fs.unlinkSync(thumbnailPath);
        }
    } catch (error) {
        console.error('Error generating thumbnails:', error);
    } finally {
        fs.unlinkSync(tempVideoPath);
    }
};
