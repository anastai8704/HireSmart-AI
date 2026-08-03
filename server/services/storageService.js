const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const { config } = require("../config/env");
const { ensureResumeDirectory, resumeDirectory } = require("../utils/resumeStorage");

const getLocalPath = (storageKey) => {
    if (!storageKey) {
        return null;
    }

    return path.join(resumeDirectory, path.basename(storageKey));
};

const s3Client = () =>
    new S3Client({
        region: config.s3Region,
        endpoint: config.s3Endpoint || undefined,
        forcePathStyle: config.s3ForcePathStyle,
        credentials:
            config.s3AccessKeyId && config.s3SecretAccessKey
                ? {
                      accessKeyId: config.s3AccessKeyId,
                      secretAccessKey: config.s3SecretAccessKey,
                  }
                : undefined,
    });

const getCurrentProvider = () => {
    return config.storageProvider === "s3" && config.s3Bucket ? "s3" : "local";
};

const saveFile = async ({ buffer, originalName }) => {
    const provider = getCurrentProvider();
    const extension = path.extname(originalName).toLowerCase();
    const storageKey = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    if (provider === "s3") {
        const client = s3Client();
        await client.send(
            new PutObjectCommand({
                Bucket: config.s3Bucket,
                Key: storageKey,
                Body: buffer,
            })
        );
        return { storageKey, provider };
    }

    ensureResumeDirectory();
    const filePath = getLocalPath(storageKey);
    await fs.promises.writeFile(filePath, buffer);
    return { storageKey, provider };
};

const deleteFile = async (storageKey, provider = getCurrentProvider()) => {
    if (!storageKey) {
        return;
    }

    if (provider === "s3") {
        const client = s3Client();
        try {
            await client.send(
                new DeleteObjectCommand({
                    Bucket: config.s3Bucket,
                    Key: storageKey,
                })
            );
        } catch (error) {
            if (error.name !== "NoSuchKey") {
                throw error;
            }
        }

        return;
    }

    const filePath = getLocalPath(storageKey);

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
};

const getFileStream = async (storageKey, provider = getCurrentProvider()) => {
    if (!storageKey) {
        throw new Error("Storage key is required to retrieve file stream");
    }

    if (provider === "s3") {
        const client = s3Client();
        const response = await client.send(
            new GetObjectCommand({
                Bucket: config.s3Bucket,
                Key: storageKey,
            })
        );

        if (!response.Body) {
            throw new Error("Unable to load file from S3");
        }

        return response.Body;
    }

    const filePath = getLocalPath(storageKey);
    await fs.promises.access(filePath);
    return fs.createReadStream(filePath);
};

module.exports = {
    saveFile,
    deleteFile,
    getFileStream,
    getLocalPath,
    getCurrentProvider,
};

