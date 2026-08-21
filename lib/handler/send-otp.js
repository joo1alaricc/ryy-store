import { google } from "googleapis";
import {
    generateOTP,
    createOTPToken
} from "../_auth.js";

function json(res, status, data) {
    res.status(status).json(data);
}

function createRawEmail(to, subject, html) {
    const message = [
        `From: RYY STORE <${process.env.GMAIL_USER}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "",
        html
    ].join("\r\n");

    return Buffer
        .from(message)
        .toString("base64url");
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return json(res, 405, {
            success: false,
            message: "Method tidak diizinkan."
        });
    }

    try {
        const { email } = req.body || {};

        if (
            !email ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return json(res, 400, {
                success: false,
                message: "Format email tidak valid."
            });
        }

        const otp = generateOTP();

        const auth = new google.auth.OAuth2(
            process.env.GMAIL_CLIENT_ID,
            process.env.GMAIL_CLIENT_SECRET
        );

        auth.setCredentials({
            refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });

        const gmail = google.gmail({
            version: "v1",
            auth
        });

        const raw = createRawEmail(
            email,
            "Kode OTP RYY STORE",
            `
            <div style="font-family:Arial,sans-serif">
                <h2>RYY STORE</h2>
                <p>Kode OTP kamu:</p>
                <h1>${otp}</h1>
                <p>Kode ini berlaku selama 5 menit.</p>
                <p>Jangan bagikan kode ini kepada siapa pun.</p>
            </div>
            `
        );

        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw
            }
        });

        const otpToken = createOTPToken(
            email,
            otp
        );

        return json(res, 200, {
            success: true,
            message: "OTP berhasil dikirim.",
            otpToken
        });

    } catch (error) {
        console.error(error);

        return json(res, 500, {
            success: false,
            message: "Gagal mengirim OTP."
        });
    }
}
