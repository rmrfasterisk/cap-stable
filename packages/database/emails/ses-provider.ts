import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { buildEnv, serverEnv } from "@cap/env";
import { render } from "@react-email/render";
import type { JSXElementConstructor, ReactElement } from "react";

let sesClient: SESClient | null = null;
let sesInitWarningLogged = false;

const getSesClient = () => {
	if (sesClient) return sesClient;

	const env = serverEnv();
	if (!env.AWS_SES_ACCESS_KEY_ID || !env.AWS_SES_SECRET_ACCESS_KEY) {
		if (!sesInitWarningLogged) {
			console.warn(
				"[SES] AWS SES credentials not configured. Set AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY to enable email sending.",
			);
			sesInitWarningLogged = true;
		}
		return null;
	}

	sesClient = new SESClient({
		region: env.AWS_SES_REGION || "us-east-1",
		credentials: {
			accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
			secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY,
		},
	});

	console.info(
		`[SES] Client initialized for region: ${env.AWS_SES_REGION || "us-east-1"}`,
	);
	return sesClient;
};

export const sendEmailViaSes = async ({
	email,
	subject,
	react,
	marketing,
	test,
	scheduledAt,
}: {
	email: string;
	subject: string;
	react: ReactElement<any, string | JSXElementConstructor<any>>;
	marketing?: boolean;
	test?: boolean;
	scheduledAt?: string;
}) => {
	const client = getSesClient();
	if (!client) {
		console.warn(
			`[SES] Skipping email to ${email} - SES client not initialized`,
		);
		return { success: false, error: "SES client not initialized" };
	}

	if (scheduledAt) {
		console.warn(
			`[SES] Scheduled emails not supported by AWS SES. Email to ${email} will be sent immediately (requested: ${scheduledAt})`,
		);
	}

	if (marketing && !buildEnv.NEXT_PUBLIC_IS_CAP)
		return { success: true, skipped: true };

	const env = serverEnv();
	let from: string;

	if (marketing) {
		from = "Richie from Cap <richie@send.cap.so>";
	} else if (buildEnv.NEXT_PUBLIC_IS_CAP) {
		from = "Cap Auth <no-reply@auth.cap.so>";
	} else {
		from = env.AWS_SES_FROM_EMAIL || `auth@${env.RESEND_FROM_DOMAIN}`;
	}

	if (!from || from === "auth@undefined") {
		console.error(
			"[SES] No valid from address configured. Set AWS_SES_FROM_EMAIL.",
		);
		return { success: false, error: "No from address configured" };
	}

	const toAddress = test ? "success@simulator.amazonses.com" : email;

	try {
		const htmlContent = await render(react);
		const textContent = await render(react, { plainText: true });

		const command = new SendEmailCommand({
			Source: from,
			Destination: {
				ToAddresses: [toAddress],
			},
			Message: {
				Subject: {
					Data: subject,
					Charset: "UTF-8",
				},
				Body: {
					Html: {
						Data: htmlContent,
						Charset: "UTF-8",
					},
					Text: {
						Data: textContent,
						Charset: "UTF-8",
					},
				},
			},
		});

		const result = await client.send(command);
		console.info(
			`[SES] Email sent successfully to ${toAddress} (MessageId: ${result.MessageId})`,
		);
		return { success: true, messageId: result.MessageId };
	} catch (error: any) {
		const errorCode = error?.name || error?.code || "Unknown";
		const errorMessage = error?.message || "Unknown error";

		console.error(`[SES] Failed to send email to ${toAddress}:`, {
			errorCode,
			errorMessage,
			subject,
			from,
		});

		if (errorCode === "MessageRejected") {
			console.error(
				"[SES] Email rejected. Common causes: unverified sender, sandbox mode restrictions, or invalid recipient.",
			);
		} else if (
			errorCode === "Throttling" ||
			errorCode === "LimitExceededException"
		) {
			console.error(
				"[SES] Rate limit exceeded. Consider implementing retry with backoff.",
			);
		} else if (errorCode === "ConfigurationSetDoesNotExist") {
			console.error(
				"[SES] Configuration set not found. Check your SES configuration.",
			);
		}

		return { success: false, error: errorMessage, errorCode };
	}
};
