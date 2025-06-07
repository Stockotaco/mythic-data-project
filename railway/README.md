# Railway Joke API

A simple Express application that serves random jokes, deployed on Railway.

## Features

- Random joke endpoint
- Health check endpoint
- Built with Express.js
- Deployed on Railway

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm run dev
```

3. For production:
```bash
npm start
```

## API Endpoints

- `GET /`: Health check endpoint
- `GET /joke`: Returns a random joke

## Example Response

```json
{
  "setup": "Why don't scientists trust atoms?",
  "punchline": "Because they make up everything!"
}
```

## Deployment

This application is configured for deployment on Railway. Simply connect your GitHub repository to Railway and it will automatically deploy your application. 