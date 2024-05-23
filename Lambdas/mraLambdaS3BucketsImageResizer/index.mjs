/**
 * @version: 8th version
 * 1-   Create `-xs` to `-xl` images immediately in S3 by visiting a `-org` file, and later process and update their content.
 * 2-   Implement the "Update S3 Object Metadata" for all images, including the `-org` image, to detect their processing status.
 */
import AWS from 'aws-sdk';
import sharp from 'sharp';

const S3 = new AWS.S3();

/**
 * Updates the metadata of an S3 object.
 * @param {string} bucket - The name of the S3 bucket.
 * @param {string} key - The key of the S3 object.
 * @param {Object} metadata - The metadata to update.
 */
const updateMetadata = async (bucket, key, metadata) => {
  const params = {
    Bucket: bucket,
    Key: key,
    CopySource: `${bucket}/${key}`,
    Metadata: metadata,
    MetadataDirective: 'REPLACE'
  };
  await S3.copyObject(params).promise();
};

/**
 * AWS Lambda handler function to resize images and update metadata.
 * @param {Object} event - The event object containing S3 bucket and object key.
 * @returns {Object} - The response object with status code and message.
 */
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
    // Get user-defined metadata
    const originalMetadata = await S3.headObject({ Bucket: bucketName, Key: key }).promise();
    const userDefinedMetadata = originalMetadata.Metadata;

    // Update metadata for the original image
    await updateMetadata(bucketName, key, { ...userDefinedMetadata, status: 'processing' });

    // Create placeholder files immediately
    const placeholderTasks = resolutions.map(({ suffix, tag }) => {
      const newKey = key.replace(orgSuffix, `${suffix}.`).replace(/\.[^.]+$/, '.webp');
      return S3.putObject({
        Bucket: bucketName,
        Key: newKey,
        Body: '',
        ContentType: 'image/webp',
        Metadata: {
          ...userDefinedMetadata,
          status: 'processing',
          resolution: tag,
          'org-image-key': key
        }
      }).promise();
    });

    await Promise.all(placeholderTasks);
    
    // Get the original image data
    const originalImage = await S3.getObject({ Bucket: bucketName, Key: key }).promise();
    let image = sharp(originalImage.Body);

    // Get existing tags
    const tags = await S3.getObjectTagging({ Bucket: bucketName, Key: key }).promise();
    const existingTags = tags.TagSet || [];

    // Process and update the content one by one
    for (const { suffix, width, tag } of resolutions) {
      const newKey = key.replace(orgSuffix, `${suffix}.`).replace(/\.[^.]+$/, '.webp');
      try {
        const resizedImageBuffer = await image.resize({ width }).rotate().toFormat('webp').toBuffer();
        const resizedImage = sharp(resizedImageBuffer);
        const resizedImageMetadata = await resizedImage.metadata();
  
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
            status: 'completed',
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
      } catch (err) {
        console.error(`Error processing ${newKey}:`, err);
        continue;
      }
    }

    // Update metadata for the original image to completed
    await updateMetadata(bucketName, key, { ...userDefinedMetadata, status: 'completed' });

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
