import sys
import os

# Add the 'python' directory to the sys.path to ensure dependencies are found
site_packages_path = os.path.join(os.getcwd(), 'python')
sys.path.append(site_packages_path)

import boto3
from moviepy.editor import VideoFileClip

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    # Download the video file from S3
    download_path = f'/tmp/{os.path.basename(key)}'
    s3_client.download_file(bucket, key, download_path)
    
    # Get video metadata and determine orientation
    clip = VideoFileClip(download_path)
    is_vertical = clip.size[0] < clip.size[1]
    
    # Define thumbnail and resolution sizes
    resolutions = [
        {'suffix': '-240p.mp4', 'size': (426, 240)},
        {'suffix': '-360p.mp4', 'size': (640, 360)},
        {'suffix': '-480p.mp4', 'size': (854, 480)},
        {'suffix': '-720p.mp4', 'size': (1280, 720)},
        {'suffix': '-1080p.mp4', 'size': (1920, 1080)},
    ]
    thumbnail_sizes = [
        {'suffix': '-xs.jpg', 'size': (320, 240)},
        {'suffix': '-sm.jpg', 'size': (640, 480)},
        {'suffix': '-md.jpg', 'size': (800, 600)},
        {'suffix': '-lg.jpg', 'size': (1024, 768)},
        {'suffix': '-xl.jpg', 'size': (1280, 960)},
    ]
    
    # Generate and upload thumbnails
    for thumb in thumbnail_sizes:
        size = thumb['size']
        if is_vertical:
            size = size[::-1]
        thumbnail_path = f'/tmp/thumbnail{thumb["suffix"]}'
        clip.save_frame(thumbnail_path, t=1.0, withmask=False, size=size)
        
        thumbnail_key = key.replace(os.path.splitext(key)[1], thumb['suffix'])
        s3_client.upload_file(thumbnail_path, bucket, thumbnail_key, ExtraArgs={'ContentType': 'image/jpeg'})
        os.remove(thumbnail_path)
    
    # Generate and upload different resolutions of the video
    for res in resolutions:
        size = res['size']
        if is_vertical:
            size = size[::-1]
        output_video_path = f'/tmp/{os.path.basename(key).replace(".mp4", "")}{res["suffix"]}'
        clip_resized = clip.resize(newsize=size)
        clip_resized.write_videofile(output_video_path)
        
        video_key = key.replace('-org.mp4', res['suffix'])
        s3_client.upload_file(output_video_path, bucket, video_key, ExtraArgs={'ContentType': 'video/mp4'})
        os.remove(output_video_path)
    
    # Cleanup
    os.remove(download_path)
    clip.close()
    
    return {
        'statusCode': 200,
        'body': 'Thumbnails and video resolutions generated and uploaded successfully'
    }
