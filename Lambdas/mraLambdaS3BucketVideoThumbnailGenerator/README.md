# Pros and cons

This approach needs to read the whole video file to be able to process it.
When the file is big, then we have problem with the memory size. Therefore, we have two options:
1. Give the internet to the lambda function, generate presigned URL and follow an approch like what has been discuased in plan A. It is not recommended as we have to pay extra for the internet access and each query to S3. Also, still we need to download the file and store it in the internal memory.
2. Provide a file system access to lambda to be able to access files in S3 directly. It is a better approch as we don't need to download the file from the internet. 

## Plan A (Not recommended)
The plan has been discussed [here](https://dev.to/benjaminadk/how-do-i-create-thumbnails-when-i-upload-a-video-aws-lambda-7l4). It can work for jumping and reading. Suitable for thumbnail generation. But it is not suitable for scenarios that we need the whole file.

```js
process.env.PATH = process.env.PATH + ':' + process.env['LAMBDA_TASK_ROOT']

const AWS = require('aws-sdk')
const { spawn, spawnSync } = require('child_process')
const { createReadStream, createWriteStream } = require('fs')

const s3 = new AWS.S3()
const ffprobePath = '/opt/nodejs/ffprobe'
const ffmpegPath = '/opt/nodejs/ffmpeg'
const allowedTypes = ['mov', 'mpg', 'mpeg', 'mp4', 'wmv', 'avi', 'webm']
const width = process.env.WIDTH
const height = process.env.HEIGHT
}

module.exports.handler = async (event, context) => {
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key).replace(/\+/g, ' ')
  const bucket = event.Records[0].s3.bucket.name
  const target = s3.getSignedUrl('getObject', { Bucket: bucket, Key: srcKey, Expires: 1000 })
  let fileType = srcKey.match(/\.\w+$/)

  if (!fileType) {
    throw new Error(`invalid file type found for key: ${srcKey}`)
  }

  fileType = fileType[0].slice(1)

  if (allowedTypes.indexOf(fileType) === -1) {
    throw new Error(`filetype: ${fileType} is not an allowed type`)
  }

  function createImage(seek) {
    return new Promise((resolve, reject) => {
      let tmpFile = createWriteStream(`/tmp/screenshot.jpg`)
      const ffmpeg = spawn(ffmpegPath, [
        '-ss',
        seek,
        '-i',
        target,
        '-vf',
        `thumbnail,scale=${width}:${height}`,
        '-qscale:v',
        '2',
        '-frames:v',
        '1',
        '-f',
        'image2',
        '-c:v',
        'mjpeg',
        'pipe:1'
      ])

      ffmpeg.stdout.pipe(tmpFile)

      ffmpeg.on('close', function(code) {
        tmpFile.end()
        resolve()
      })

      ffmpeg.on('error', function(err) {
        console.log(err)
        reject()
      })
    })
  }

  function uploadToS3(x) {
    return new Promise((resolve, reject) => {
      let tmpFile = createReadStream(`/tmp/screenshot.jpg`)
      let dstKey = srcKey.replace(/\.\w+$/, `-${x}.jpg`).replace('/videos/', '/thumbnails/')

      var params = {
        Bucket: bucket,
        Key: dstKey,
        Body: tmpFile,
        ContentType: `image/jpg`
      }

      s3.upload(params, function(err, data) {
        if (err) {
          console.log(err)
          reject()
        }
        console.log(`successful upload to ${bucket}/${dstKey}`)
        resolve()
      })
    })
  }

  const ffprobe = spawnSync(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    target
  ])

  const duration = Math.ceil(ffprobe.stdout.toString())

  await createImage(duration * 0.25)
  await uploadToS3(1)
  await createImage(duration * .5)
  await uploadToS3(2)
  await createImage(duration * .75)
  await uploadToS3(3)

  return console.log(`processed ${bucket}/${srcKey} successfully`)
}
```

For this approach you need to give your AWS Lambda function internet access, you need to configure it to run within a VPC and set up a NAT Gateway or NAT Instance. Here are the steps to enable internet access for your Lambda function:

### Step-by-Step Guide

#### 1\. Create a VPC

If you don't already have a VPC, you'll need to create one.

1.  **Create a VPC**:
    
    -   Go to the VPC console.
    -   Click on "Create VPC."
    -   Provide a name and set the IPv4 CIDR block (e.g., `10.0.0.0/16`).
2.  **Create Subnets**:
    
    -   Create two subnets: one public and one private.
    -   Go to the "Subnets" section in the VPC console and click "Create subnet."
    -   Create a public subnet (e.g., `10.0.1.0/24`) and a private subnet (e.g., `10.0.2.0/24`).
3.  **Create an Internet Gateway**:
    
    -   Go to the "Internet Gateways" section.
    -   Click "Create Internet Gateway" and then "Attach to VPC."
4.  **Create a NAT Gateway**:
    
    -   Go to the "NAT Gateways" section.
    -   Click "Create NAT Gateway" and place it in the public subnet.
    -   Allocate a new Elastic IP for the NAT Gateway.
5.  **Update Route Tables**:
    
    -   Go to the "Route Tables" section.
    -   Create a route table for the public subnet and add a route to the Internet Gateway (`0.0.0.0/0` -> `igw-xxxxxxxx`).
    -   Create a route table for the private subnet and add a route to the NAT Gateway (`0.0.0.0/0` -> `nat-xxxxxxxx`).

#### 2\. Configure the Lambda Function

1.  **Set VPC Configuration**:
    
    -   Go to the Lambda console.
    -   Select your Lambda function.
    -   In the "Configuration" tab, click "VPC."
    -   Select the VPC, private subnets, and the appropriate security group.
2.  **Update Security Group**:
    
    -   Ensure the security group associated with your Lambda function allows outbound internet access (e.g., `0.0.0.0/0` for outbound traffic).

#### 3\. Test the Lambda Function

Deploy your Lambda function and test to ensure it has internet access. Here’s an example to check internet connectivity:

```js
const https = require('https');

exports.handler = async (event) => {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org?format=json', (resp) => {
            let data = '';

            // A chunk of data has been received.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received.
            resp.on('end', () => {
                resolve({
                    statusCode: 200,
                    body: data
                });
            });

        }).on("error", (err) => {
            reject({
                statusCode: 500,
                body: JSON.stringify(err)
            });
        });
    });
};

```

### Summary of Steps:

1.  Create a VPC.
2.  Create public and private subnets.
3.  Create and attach an Internet Gateway.
4.  Create a NAT Gateway in the public subnet.
5.  Update the route tables to direct traffic through the Internet Gateway and NAT Gateway.
6.  Configure your Lambda function to use the VPC and private subnets.
7.  Ensure the security group allows outbound traffic.
8.  Deploy and test the Lambda function for internet access.

By following these steps, you can configure your Lambda function to have internet access while still running within a VPC.

### Costs Involved

#### VPC Costs

-   **VPC itself**: Generally, there are no additional charges for creating and using a VPC. You pay for the resources you provision in the VPC (e.g., EC2 instances, NAT Gateway, etc.).

#### NAT Gateway Costs

-   **Hourly Charge**: You are charged for each hour your NAT Gateway is provisioned and available. The typical cost is around $0.045 per hour.
-   **Data Processing Charge**: You are charged for each gigabyte of data processed by the NAT Gateway. The typical cost is around $0.045 per GB.

For example, if you have a NAT Gateway running 24/7 for a month (720 hours) and it processes 100 GB of data, the cost would be:

-   **Hourly Charge**: 720 hours \* $0.045 = $32.40
-   **Data Processing Charge**: 100 GB \* $0.045 = $4.50
-   **Total Cost**: $32.40 + $4.50 = $36.90 per month

#### Example Configuration Costs

-   **t3.micro NAT Instance**: $7.75 per month if using a NAT instance.
-   **NAT Gateway**: Approximately $37.35 per month as a flat rate.

These costs can vary based on your specific usage and AWS region. For detailed and up-to-date pricing, you can use the [AWS Pricing Calculator](https://calculator.aws).

### Additional Considerations

-   **High Availability**: For redundancy, you might need to set up multiple NAT Gateways in different Availability Zones, which can double the costs.
-   **Security**: Ensure your security groups and NACLs are properly configured to allow the necessary traffic.

By configuring a VPC with a NAT Gateway and attaching it to your Lambda function, you can ensure it has the necessary internet access while keeping your architecture secure and manageable.

## Plan B
A better approch is to provide a direct access to file that are stored in S3. If you need `ffmpeg` and `ffprobe` to work directly with files in S3 and your Lambda function doesn't have internet access, you'll need to mount the S3 bucket as a file system using AWS Lambda's support for Amazon S3 as an Elastic File System (EFS) mount.

Here's how you can approach this:

1.  **Create an EFS File System**: Create an EFS file system and attach it to your Lambda function.
2.  **Mount the EFS File System**: Configure the Lambda function to mount the EFS file system to a specific directory.
3.  **Use AWS DataSync**: Use AWS DataSync to transfer files between S3 and your EFS file system.

### Step-by-Step Implementation

#### 1\. Create and Attach an EFS File System

1.  **Create an EFS File System**:
    
    -   Go to the Amazon EFS console.
    -   Create a new EFS file system.
    -   Make sure it is accessible from the VPC in which your Lambda function is running.
2.  **Attach the EFS File System to Your Lambda Function**:
    
    -   Go to the Lambda console.
    -   In your function's configuration, add an EFS file system under the "File system" settings.
    -   Specify the access point and the local mount path (e.g., `/mnt/efs`).

#### 2\. Update the Lambda Function to Use the EFS Mount

Update your Lambda function to use the EFS mount point. Here’s how you can do it:

```js
import AWS from 'aws-sdk';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const { S3 } = AWS;
const s3 = new S3();
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
const efsPath = '/mnt/efs';

export const handler = async (event) => {
    const { bucket, key } = event;
    const tempVideoPath = `${efsPath}/${path.basename(key)}`;
    const videoExt = path.extname(key);
    const baseName = path.basename(key, videoExt);
    const allowedTypes = ['mov', 'mpg', 'mpeg', 'mp4', 'wmv', 'avi', 'webm'];

    // Check file type
    const fileType = videoExt.slice(1);
    if (!allowedTypes.includes(fileType)) {
        throw new Error(`filetype: ${fileType} is not an allowed type`);
    }

    try {
        // Download the video file from S3 to EFS
        console.log(`Downloading video from S3: ${bucket}/${key}`);
        const video = await s3.getObject({ Bucket: bucket, Key: key }).promise();
        fs.writeFileSync(tempVideoPath, video.Body);
        console.log(`Downloaded video to: ${tempVideoPath}`);

        // Generate thumbnails based on orientation
        const thumbnailSizes = [
            { suffix: '-xs.webp', size: '320x240' },
            { suffix: '-sm.webp', size: '640x480' },
            { suffix: '-md.webp', size: '800x600' },
            { suffix: '-lg.webp', size: '1024x768' },
            { suffix: '-xl.webp', size: '1280x960' },
        ];

        // Get video duration
        const ffprobe = spawnSync(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1',
            tempVideoPath
        ]);
        const duration = Math.ceil(ffprobe.stdout.toString());
        console.log(`Video duration: ${duration} seconds`);

        // Get video orientation
        const orientation = spawnSync(ffprobePath, [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=s=x:p=0',
            tempVideoPath
        ]).stdout.toString();
        console.log(`Video orientation: ${orientation}`);
        const [width, height] = orientation.split('x').map(Number);
        const isVertical = height > width;

        for (const { suffix, size } of thumbnailSizes) {
            const [w, h] = size.split('x').map(Number);
            const thumbnailSize = isVertical ? `${h}x${w}` : size;
            const thumbnailPath = `${efsPath}/${baseName}${suffix}.webp`;

            console.log(`Creating thumbnail: ${thumbnailPath} with size: ${thumbnailSize}`);
            await createImage(tempVideoPath, thumbnailSize, duration * 0.5, thumbnailPath);
            console.log(`Uploading thumbnail: ${thumbnailPath}`);
            await uploadToS3(bucket, key, thumbnailPath, suffix);

            fs.unlinkSync(thumbnailPath);
        }
    } catch (error) {
        console.error('Error generating thumbnails:', error);
    } finally {
        if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
        }
    }
};

const createImage = (videoPath, thumbnailSize, seek, thumbnailPath) => {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            '-ss', seek,
            '-i', videoPath,
            '-vf', `thumbnail,scale=${thumbnailSize}`,
            '-frames:v', '1',
            '-f', 'image2',
            '-c:v', 'webp',
            'pipe:1'
        ]);

        const tmpFile = createWriteStream(thumbnailPath);
        ffmpeg.stdout.pipe(tmpFile);

        ffmpeg.on('close', function (code) {
            console.log(`ffmpeg process closed with code: ${code}`);
            tmpFile.end();
            resolve();
        });

        ffmpeg.on('error', function (err) {
            console.log('ffmpeg error:', err);
            reject(err);
        });

        ffmpeg.stderr.on('data', (data) => {
            console.log('ffmpeg stderr:', data.toString());
        });
    });
};

const uploadToS3 = (bucket, key, thumbnailPath, suffix) => {
    return new Promise((resolve, reject) => {
        const thumbnailData = createReadStream(thumbnailPath);
        const thumbnailKey = key.replace(`-org${path.extname(key)}`, suffix);

        const params = {
            Bucket: bucket,
            Key: thumbnailKey,
            Body: thumbnailData,
            ContentType: 'image/webp'
        };

        s3.upload(params, function (err, data) {
            if (err) {
                console.log('Error uploading to S3:', err);
                reject(err);
            } else {
                console.log(`Successful upload to ${bucket}/${thumbnailKey}`);
                resolve();
            }
        });
    });
};
```
### Summary of Changes:

1.  **EFS File System**: The code now uses an EFS file system mounted at `/mnt/efs` to store temporary files.
2.  **Local Path Handling**: Paths for temporary files and thumbnails are adjusted to use the EFS mount point.
3.  **Data Transfer**: The video is downloaded from S3 to EFS, then processed locally, ensuring `ffmpeg` and `ffprobe` have access to the full file without requiring internet access.

### Setup Instructions:

1.  **Create an EFS File System**: Follow the steps to create an EFS file system.
2.  **Configure Lambda to Use EFS**: Attach the EFS file system to your Lambda function.
3.  **Update Lambda Function**: Deploy the updated Lambda function code.

By following these steps, you ensure that your Lambda function can process video files stored in S3 without requiring internet access, leveraging the capabilities of EFS for local file handling.