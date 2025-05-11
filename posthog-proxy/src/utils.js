/**
 * Decompress gzip data using a robust approach that handles incomplete data
 * @param {Uint8Array} compressedData - The compressed data
 * @returns {Promise<string>} - The decompressed text
 */
export async function decompressGzipData(compressedData) {
    // Try multiple decompression approaches
    let lastError = null

    // Approach 1: Standard DecompressionStream
    try {
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(compressedData)
                controller.close()
            }
        })

        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
        return await new Response(decompressedStream).text()
    } catch (error) {
        console.warn('Standard decompression failed:', error)
        lastError = error
    }

    // Approach 2: Chunked decompression
    try {
        return await decompressChunkedGzip(compressedData)
    } catch (error) {
        console.warn('Chunked decompression failed:', error)
        lastError = error
    }

    // Approach 3: Try to fix the gzip header and decompress
    try {
        // Ensure the gzip header is correct
        const fixedData = new Uint8Array(compressedData.length)
        fixedData.set(compressedData)

        // Set the correct gzip magic bytes
        fixedData[0] = 0x1F
        fixedData[1] = 0x8B
        fixedData[2] = 0x08  // Deflate compression method

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(fixedData)
                controller.close()
            }
        })

        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
        return await new Response(decompressedStream).text()
    } catch (error) {
        console.warn('Fixed header decompression failed:', error)
        lastError = error
    }

    // If all approaches fail, throw the last error
    throw new Error(`All decompression methods failed: ${lastError.message}`)
}

/**
 * Decompress gzip data in chunks to handle incomplete data
 * @param {Uint8Array} compressedData - The compressed data
 * @returns {Promise<string>} - The decompressed text
 */
export async function decompressChunkedGzip(compressedData) {
    return new Promise((resolve, reject) => {
        // Create streams for chunked processing
        const { readable, writable } = new TransformStream()

        // Set up the decompression pipeline
        const decompressedStream = readable.pipeThrough(new DecompressionStream('gzip'))

        // Get a writer for the input
        const writer = writable.getWriter()

        // Collect the decompressed output
        let decompressedText = ''
        const reader = decompressedStream.getReader()

        // Function to read chunks
        function readChunks() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    resolve(decompressedText)
                    return
                }

                // Append the chunk to our result
                if (value) {
                    decompressedText += new TextDecoder().decode(value)
                }

                // Continue reading
                readChunks()
            }).catch(error => {
                reject(error)
            })
        }

        // Start reading
        readChunks()

        // Write the data in small chunks
        const chunkSize = 256 // Very small chunks for better handling
        let offset = 0

        function writeNextChunk() {
            if (offset >= compressedData.length) {
                writer.close().catch(error => {
                    reject(error)
                })
                return
            }

            const end = Math.min(offset + chunkSize, compressedData.length)
            const chunk = compressedData.slice(offset, end)

            writer.write(chunk).then(() => {
                offset = end
                writeNextChunk()
            }).catch(error => {
                writer.abort(error)
                reject(error)
            })
        }

        // Start writing
        writeNextChunk()
    })
}

/**
 * Handle CORS preflight requests
 * @returns {Response} - CORS preflight response
 */
export function handleCorsRequest() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
            'Access-Control-Max-Age': '86400'
        }
    })
}

/**
 * Extract and decode PostHog event data
 * @param {Request} request - The incoming request
 * @returns {Promise<Object>} - The decoded data and metadata
 */
export async function extractPostHogData(request) {
    // Get the URL and query parameters
    const url = new URL(request.url)
    const queryParams = {}
    for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value
    }

    // Get headers
    const headers = {}
    for (const [key, value] of request.headers.entries()) {
        headers[key] = value
    }

    // Get the content type
    const contentType = request.headers.get('content-type') || ''

    // Get the raw body as an array buffer
    const buffer = await request.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Check if the data is gzipped
    const isGzipped = bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B

    let decompressedData
    let jsonData

    if (isGzipped) {
        try {
            // Try to decompress the data
            decompressedData = await decompressGzipData(bytes)
        } catch (gzipError) {
            throw new Error(`Failed to decompress gzip data: ${gzipError.message}`)
        }
    } else {
        // Not gzipped, decode as text
        decompressedData = new TextDecoder().decode(bytes)
    }

    // Try to parse as JSON
    try {
        jsonData = JSON.parse(decompressedData)
    } catch (jsonError) {
        throw new Error(`Failed to parse as JSON: ${jsonError.message}`)
    }

    // Return the extracted data
    return {
        jsonData,
        queryParams,
        headers,
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString()
    }
}
