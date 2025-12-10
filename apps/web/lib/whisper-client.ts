import { serverEnv } from "@cap/env";
import { createWriteStream } from "fs";
import { stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000;
const FFMPEG_TIMEOUT = 5 * 60 * 1000;
const WHISPER_TIMEOUT = 10 * 60 * 1000;

export async function transcribeWithWhisper(videoUrl: string): Promise<string> {
	const apiKey = serverEnv().OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is required for Whisper transcription");
	}

	const tempId = `whisper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const tempVideoPath = join(tmpdir(), `${tempId}-video.mp4`);
	const tempAudioPath = join(tmpdir(), `${tempId}-audio.mp3`);

	try {
		console.log("[whisper] Downloading video from URL...");
		await withTimeout(
			downloadFile(videoUrl, tempVideoPath),
			DOWNLOAD_TIMEOUT,
			"Video download timed out",
		);

		console.log(
			"[whisper] Extracting audio with ffmpeg (64kbps mono 16kHz)...",
		);
		await withTimeout(
			extractAudio(tempVideoPath, tempAudioPath),
			FFMPEG_TIMEOUT,
			"FFmpeg audio extraction timed out",
		);

		const audioStats = await stat(tempAudioPath);
		console.log(
			`[whisper] Audio file size: ${(audioStats.size / 1024 / 1024).toFixed(2)}MB`,
		);

		if (audioStats.size > MAX_AUDIO_SIZE) {
			throw new Error(
				`Audio file size (${(audioStats.size / 1024 / 1024).toFixed(2)}MB) exceeds Whisper's 25MB limit. ` +
					`Consider using TRANSCRIPTION_PROVIDER=deepgram for longer videos.`,
			);
		}

		console.log("[whisper] Uploading to OpenAI Whisper API...");
		const vtt = await withTimeout(
			sendToWhisperAPI(tempAudioPath, apiKey),
			WHISPER_TIMEOUT,
			"Whisper API request timed out",
		);

		console.log("[whisper] Transcription complete");
		return vtt;
	} finally {
		await cleanupFile(tempVideoPath);
		await cleanupFile(tempAudioPath);
	}
}

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timeoutId: NodeJS.Timeout;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(message)), ms);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutId!);
	}
}

async function cleanupFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`[whisper] Failed to cleanup ${path}:`, err);
		}
	}
}

async function downloadFile(url: string, destPath: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to download video: ${response.status} ${response.statusText}`,
		);
	}

	const contentLength = response.headers.get("content-length");
	if (contentLength) {
		const size = parseInt(contentLength, 10);
		if (size > MAX_VIDEO_SIZE) {
			throw new Error(
				`Video too large: ${(size / 1024 / 1024).toFixed(0)}MB exceeds ${MAX_VIDEO_SIZE / 1024 / 1024}MB limit. ` +
					`Consider using TRANSCRIPTION_PROVIDER=deepgram for large videos.`,
			);
		}
	}

	if (!response.body) {
		throw new Error("Response body is null");
	}

	const fileStream = createWriteStream(destPath);
	const readable = Readable.fromWeb(response.body as ReadableStream);

	try {
		await finished(readable.pipe(fileStream));
	} catch (err) {
		fileStream.destroy();
		await cleanupFile(destPath);
		throw err;
	}
}

function extractAudio(inputPath: string, outputPath: string): Promise<void> {
	const ffmpeg = require("fluent-ffmpeg");

	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.noVideo()
			.audioCodec("libmp3lame")
			.audioBitrate("64k")
			.audioChannels(1)
			.audioFrequency(16000)
			.output(outputPath)
			.on("start", (cmd: string) => {
				console.log("[whisper] ffmpeg command:", cmd);
			})
			.on("error", (err: Error) => {
				console.error("[whisper] ffmpeg error:", err);
				reject(new Error(`FFmpeg error: ${err.message}`));
			})
			.on("end", () => {
				resolve();
			})
			.run();
	});
}

async function sendToWhisperAPI(
	audioPath: string,
	apiKey: string,
): Promise<string> {
	const FormData = (await import("formdata-node")).FormData;
	const { fileFromPath } = await import("formdata-node/file-from-path");

	const file = await fileFromPath(audioPath, "audio.mp3", {
		type: "audio/mpeg",
	});

	const formData = new FormData();
	formData.append("file", file);
	formData.append("model", "whisper-1");
	formData.append("response_format", "vtt");

	const response = await fetch(WHISPER_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData as any,
	});

	if (!response.ok) {
		const errorText = await response.text();

		if (response.status === 429) {
			const retryAfter = response.headers.get("retry-after");
			throw new Error(
				`Whisper API rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : ""} ` +
					`Consider using TRANSCRIPTION_PROVIDER=deepgram for high-volume transcription.`,
			);
		}

		throw new Error(`Whisper API error: ${response.status} ${errorText}`);
	}

	return await response.text();
}
