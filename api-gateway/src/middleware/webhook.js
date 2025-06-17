import crypto from 'crypto';

// HighLevel webhook public key
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

export const validateWebhook = async (c, next) => {
    // Allow test bypass
    const url = new URL(c.req.url);
    if (url.searchParams.get('test') === 'true') {
        try {
            c.req.body = await c.req.json();
        } catch (e) {
            return c.json({ error: 'Invalid JSON body' }, 400);
        }
        await next();
        return;
    }

    const signature = c.req.header('x-wh-signature');
    const rawBody = await c.req.text();

    if (!signature) {
        return c.json({ error: 'Missing signature' }, 401);
    }

    // Verify the signature using RSA public key
    const verifier = crypto.createVerify('SHA256');
    verifier.update(rawBody);
    verifier.end();
    const isValid = verifier.verify(PUBLIC_KEY, signature, 'base64');

    if (!isValid) {
        return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse the body and attach it to the context
    try {
        c.req.body = JSON.parse(rawBody);
    } catch (e) {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }

    await next();
};
