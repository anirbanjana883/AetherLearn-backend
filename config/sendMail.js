import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (to, subject, htmlContent) => {
  try {
    const data = await resend.emails.send({
      from: "AetherLearn <onboarding@resend.dev>",
      to: to,
      subject: subject, 
      html: htmlContent, 
    });

    console.log(`Email sent to ${to}: ${data.id}`);
    return data;
  } catch (error) {
    console.error("Resend Email Error:", error);
    throw error;
  }
};

export default sendMail;