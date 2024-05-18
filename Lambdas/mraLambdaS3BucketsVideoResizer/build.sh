#!/bin/bash

# Variables
FUNCTION_NAME="mraLambdaS3BucketsVideoResizer"
PYTHON_VERSION="python3.12"

# Create a virtual environment and install dependencies
python3 -m venv venv
source venv/bin/activate
pip install boto3 moviepy

# Deactivate the virtual environment
deactivate

# Create a package directory
mkdir -p package

# Copy function code and dependencies
cp lambda_function.py package/
cp -r venv/lib/${PYTHON_VERSION}/site-packages/* package/

# Zip the package
cd package
zip -r ../mraLambdaS3BucketsVideoResizer.zip *
cd ..

# Clean up
rm -rf package venv

# Upload to AWS Lambda
aws lambda update-function-code --function-name ${FUNCTION_NAME} --zip-file fileb://mraLambdaS3BucketsVideoResizer.zip
