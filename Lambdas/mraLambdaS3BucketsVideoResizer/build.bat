@echo off

:: Variables
set FUNCTION_NAME=mraLambdaS3BucketsVideoResizer
set PYTHON_VERSION=3.12
set PLATFORM=manylinux2014_aarch64

:: Create a temporary directory for the deployment package
mkdir package
mkdir package\python

:: Create a virtual environment
python -m venv venv
call venv\Scripts\activate.bat

:: Upgrade pip and install dependencies in the 'python' directory
pip install --upgrade pip
pip install --platform %PLATFORM% --target=package\python --implementation cp --python-version %PYTHON_VERSION% --only-binary=:all: --upgrade -r requirements.txt

:: Deactivate the virtual environment
call venv\Scripts\deactivate.bat

:: Copy function code
copy lambda_function.py package\

:: Zip the package
cd package
powershell Compress-Archive -Force -Path * -DestinationPath ..\mraLambdaS3BucketsVideoResizer.zip
cd ..

:: Clean up
rmdir /S /Q package
rmdir /S /Q venv

:: Upload the zip file to S3
aws s3 cp mraLambdaS3BucketsVideoResizer.zip s3://mra-private-bucket/lambda/
