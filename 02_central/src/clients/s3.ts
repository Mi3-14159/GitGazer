import {GetObjectCommand, GetObjectCommandOutput, S3Client} from '@aws-sdk/client-s3';

const client = new S3Client({});

const uiBucketName = process.env.UI_BUCKET_NAME;
if (!uiBucketName) {
    throw new Error('UI_BUCKET_NAME is not defined');
}

export const getIndexHtml = async (): Promise<GetObjectCommandOutput> => {
    const data = await client.send(
        new GetObjectCommand({
            Bucket: uiBucketName,
            Key: 'index.html',
        }),
    );

    return data;
};
