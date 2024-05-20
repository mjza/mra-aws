import AWS from 'aws-sdk';
import sharp from 'sharp';

const S3 = new AWS.S3();

export const handler = async (event) => {
  const bucketName = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const orgSuffix = '-org.';

  if (!key.includes(orgSuffix)) {
    console.log(`Skipping file: ${key}. It is not an original file.`);
    return {
      statusCode: 200,
      body: JSON.stringify('File skipped: not an original file'),
    };
  }

  const resolutions = [
    { suffix: '-xs', width: 576, tag: 'xs' },
    { suffix: '-sm', width: 768, tag: 'sm' },
    { suffix: '-md', width: 992, tag: 'md' },
    { suffix: '-lg', width: 1200, tag: 'lg' },
    { suffix: '-xl', width: 1400, tag: 'xl' }
  ];

  try {
    const originalImage = await S3.getObject({ Bucket: bucketName, Key: key }).promise();
    const image = sharp(originalImage.Body);

    // Get user-defined metadata
    const originalMetadata = await S3.headObject({ Bucket: bucketName, Key: key }).promise();
    const userDefinedMetadata = originalMetadata.Metadata;

    // Get existing tags
    const tags = await S3.getObjectTagging({ Bucket: bucketName, Key: key }).promise();
    const existingTags = tags.TagSet || [];

    const tasks = resolutions.map(async ({ suffix, width, tag }) => {
      const resizedImageBuffer = await image.resize({ width }).rotate().toFormat('webp').toBuffer();
      const resizedImage = sharp(resizedImageBuffer);
      const resizedImageMetadata = await resizedImage.metadata();

      // Replace orgSuffix and change extension to .webp
      const newKey = key.replace(orgSuffix, `${suffix}.`).replace(/\.[^.]+$/, '.webp');

      // Filter metadata to include only relevant fields
      const metadataFields = ['width', 'height', 'size', 'orientation', 'channels', 'space'];
      const metadataStrings = metadataFields.reduce((acc, field) => {
        if (resizedImageMetadata[field] !== undefined) {
          acc[field] = String(resizedImageMetadata[field]);
        }
        return acc;
      }, {});

      // Create new tags array and add relevant metadata as tags
      const newTags = [
        ...existingTags,
        { Key: 'resolution', Value: tag },
        { Key: 'org-image-key', Value: key }
      ];

      // Add only the necessary metadata to tags
      Object.entries(metadataStrings).forEach(([metaKey, metaValue]) => {
        if (newTags.length < 10) {
          newTags.push({ Key: metaKey, Value: metaValue });
        }
      });

      await S3.putObject({
        Bucket: bucketName,
        Key: newKey,
        Body: resizedImageBuffer,
        ContentType: 'image/webp',
        Metadata: {
          ...userDefinedMetadata,          
          resolution: tag,
          'org-image-key': key,
          ...metadataStrings,
        }
      }).promise();

      await S3.putObjectTagging({
        Bucket: bucketName,
        Key: newKey,
        Tagging: { TagSet: newTags }
      }).promise();
    });

    await Promise.all(tasks);

    return {
      statusCode: 200,
      body: JSON.stringify('Images resized and tagged successfully'),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify('Error resizing images'),
    };
  }
};
