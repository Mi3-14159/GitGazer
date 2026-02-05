import {GetObjectCommand, GetObjectCommandOutput, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl as S3getSignedUrl} from '@aws-sdk/s3-request-presigner';

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

export const getSignedUrl = async (params: {bucket: string; key: string; expiresInSec?: number}): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
    });

    return await S3getSignedUrl(client, command, {expiresIn: params.expiresInSec || 60});
};
