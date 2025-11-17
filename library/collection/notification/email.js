import nodemailer from 'nodemailer';

// Create a transporter using SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_KEY,
    },
});

export async function sendEmail(data = {}) {
    try {
        let to = data?.to ?? '';
        let cc = data?.cc ?? '';
        let bcc = data?.bcc ?? '';
        let subject = data?.subject ?? '';
        let text = data?.text ?? '';
        let html = data?.html ?? '';

        if (!to) {
            throw 'Please specify email destination!';
        }
        if (!(text || html)) {
            throw 'Please provide email content!';
        }
        if (!subject) {
            throw 'Please provide email subject!';
        }

        let mailOptions = {
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
        };

        if (cc) {
            mailOptions['cc'] = cc;
        }
        if (bcc) {
            mailOptions['bcc'] = bcc;
        }

        if (html) {
            mailOptions['html'] = html;
        } else {
            mailOptions['text'] = text;
        }

        let emailRes = await transporter.sendMail(mailOptions);

        if (emailRes?.error) {
            throw emailRes.error;
        } else {
            return { success: true };
        }
    } catch (err) {
        console.log('Error: ', err);
        return { error: typeof err == 'string' ? err : 'System error, contact provider!' };
    }
}
