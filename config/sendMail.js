import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (to, otp) => {
  try {
    const data = await resend.emails.send({
      from: "AetherLearn <onboarding@resend.dev>",
      to: to,
      subject: "Your AetherLearn OTP",
      text: `Hello Learner, Here is your One-Time Password (OTP) to continue with AetherLearn: ${otp}. This code is valid for 5 minutes.`,
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

    console.log("Email sent successfully:", data);
    return data;
  } catch (error) {
    console.error("Resend Email Error:", error);
    throw error;
  }
};

export default sendMail;