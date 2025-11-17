import axios from 'axios';

export async function sendSlackMsg(data = {}) {
    try {
        let text = data?.text ?? '';
        if (!text) {
            throw 'Please provide text message to send!';
        }

        let res = await axios.post(
            process.env.SLACK_URL,
            {
                text: text,
            },
            {
                headers: {
                    'content-type': 'application/json',
                },
            }
        );

        if (res?.status == 200) {
            return { success: true };
        } else if (res.error) {
            throw 'Failed to send message!';
        } else {
            throw 'System error!';
        }
    } catch (err) {
        console.log('Error: ', err);
        return { error: typeof err == 'string' ? err : 'System error, contact provider!' };
    }
}
