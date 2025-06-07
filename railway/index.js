const express = require('express')
const app = express()
const port = process.env.PORT || 3000

// Route to get a random joke
app.get('/joke', async (req, res) => {
    try {
        const response = await fetch('https://official-joke-api.appspot.com/random_joke')
        const joke = await response.json()

        res.json({
            setup: joke.setup,
            punchline: joke.punchline
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch joke' })
    }
})

// Health check route
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Joke API is running' })
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
}) 