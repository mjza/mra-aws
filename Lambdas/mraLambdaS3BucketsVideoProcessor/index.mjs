import AWS from 'aws-sdk';

const { Lambda } = AWS;
const lambda = new Lambda();

const validVideoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm'];

export const handler = async (event) => {
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const extension = key.slice(-4).toLowerCase();

    // Ensure the file ends with '-org.<ext>'
    if (!validVideoExtensions.includes(extension) || !key.endsWith(`-org${extension}`)) {
        console.log(`Skipping non-video or incorrectly named file: ${key}`);
        return;
    }

    const params = {
        FunctionName: 'mraLambdaS3BucketVideoThumbnailGenerator',
        InvocationType: 'Event',
        Payload: JSON.stringify({ bucket, key }),
    };

    try {
        await lambda.invoke(params).promise();
        console.log(`Successfully invoked mraLambdaS3BucketVideoThumbnailGenerator for ${key}`);
    } catch (error) {
        console.error(`Error invoking mraLambdaS3BucketVideoThumbnailGenerator for ${key}:`, error);
    }
};
