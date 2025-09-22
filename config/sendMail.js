import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create a test account or replace with real credentials.
const transporter = nodemailer.createTransport({
  service: "Gmail",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASSWORD,
  },
});

const sendMail = async (to, otp) => {
  await transporter.sendMail({
    from: `"AetherLearn" <${process.env.USER_EMAIL}>`,
    to,
    subject: "Your AetherLearn OTP",

    text: `Hello Learner,

Here is your One-Time Password (OTP) to continue with AetherLearn: ${otp}

This code is valid for 5 minutes.

If you did not request this, please ignore this email.

- The AetherLearn Team`,

    html: `
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px; text-align: center; color: #111827;">
        <h2 style="margin-bottom: 16px;">Hello Learner,</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
          Here is your One-Time Password (OTP) to continue with AetherLearn.
          This code is valid for <strong>5 minutes</strong>.
        </p>
        <div style="display: inline-block; padding: 14px 22px; border-radius: 8px; background: #111827; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 4px; margin-bottom: 24px;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">
          If you did not request this, please ignore this email.
        </p>
        <p style="font-size: 13px; color: #9ca3af; margin-top: 10px;">
          - The AetherLearn Team
        </p>
      </div>
    `,
  });
};

export default sendMail;
