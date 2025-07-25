const axios = require('axios');
const { encryptData, decryptData } = require('../config/database');

class AirbyteApiService {
    constructor(credentials) {
        this.baseURL = process.env.AIRBYTE_API_URL;
        this.credentials = credentials;
        this.axiosInstance = this.createAxiosInstance();
    }

    createAxiosInstance() {
        const instance = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add request interceptor for authentication
        instance.interceptors.request.use((config) => {
            if (this.credentials) {
                const decryptedCreds = decryptData(this.credentials);
                if (decryptedCreds) {
                    config.auth = {
                        username: decryptedCreds.username,
                        password: decryptedCreds.password,
                    };
                }
            }
            return config;
        });

        // Add response interceptor for error handling
        instance.interceptors.response.use(
            (response) => response,
            (error) => {
                console.error('Airbyte API Error:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    url: error.config?.url,
                });
                return Promise.reject(error);
            }
        );

        return instance;
    }

    // Get all workspaces
    async getWorkspaces() {
        try {
            const response = await this.axiosInstance.get('/workspaces/list');
            return response.data.workspaces || [];
        } catch (error) {
            throw new Error(`Failed to fetch workspaces: ${error.message}`);
        }
    }

    // Get all sources in a workspace
    async getSources(workspaceId) {
        try {
            const response = await this.axiosInstance.post('/sources/list', {
                workspaceId,
            });
            return response.data.sources || [];
        } catch (error) {
            throw new Error(`Failed to fetch sources: ${error.message}`);
        }
    }

    // Get all destinations in a workspace
    async getDestinations(workspaceId) {
        try {
            const response = await this.axiosInstance.post('/destinations/list', {
                workspaceId,
            });
            return response.data.destinations || [];
        } catch (error) {
            throw new Error(`Failed to fetch destinations: ${error.message}`);
        }
    }

    // Get all connections in a workspace
    async getConnections(workspaceId) {
        try {
            const response = await this.axiosInstance.post('/connections/list', {
                workspaceId,
            });
            return response.data.connections || [];
        } catch (error) {
            throw new Error(`Failed to fetch connections: ${error.message}`);
        }
    }

    // Get connection details
    async getConnection(connectionId) {
        try {
            const response = await this.axiosInstance.post('/connections/get', {
                connectionId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch connection: ${error.message}`);
        }
    }

    // Trigger a sync job
    async triggerSync(connectionId, jobType = 'sync') {
        try {
            const response = await this.axiosInstance.post('/connections/sync', {
                connectionId,
                jobType,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to trigger sync: ${error.message}`);
        }
    }

    // Get job status
    async getJobStatus(jobId) {
        try {
            const response = await this.axiosInstance.post('/jobs/get', {
                id: jobId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch job status: ${error.message}`);
        }
    }

    // Get job logs
    async getJobLogs(jobId) {
        try {
            const response = await this.axiosInstance.post('/jobs/get_debug_info', {
                id: jobId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch job logs: ${error.message}`);
        }
    }

    // Cancel a job
    async cancelJob(jobId) {
        try {
            const response = await this.axiosInstance.post('/jobs/cancel', {
                id: jobId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to cancel job: ${error.message}`);
        }
    }

    // Get source schema
    async getSourceSchema(sourceId) {
        try {
            const response = await this.axiosInstance.post('/sources/discover_schema', {
                sourceId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch source schema: ${error.message}`);
        }
    }

    // Test source connection
    async testSourceConnection(sourceConfiguration, sourceDefinitionId) {
        try {
            const response = await this.axiosInstance.post('/sources/check_connection', {
                sourceConfiguration,
                sourceDefinitionId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to test source connection: ${error.message}`);
        }
    }

    // Test destination connection
    async testDestinationConnection(destinationConfiguration, destinationDefinitionId) {
        try {
            const response = await this.axiosInstance.post('/destinations/check_connection', {
                destinationConfiguration,
                destinationDefinitionId,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to test destination connection: ${error.message}`);
        }
    }

    // Get available source definitions
    async getSourceDefinitions() {
        try {
            const response = await this.axiosInstance.get('/source_definitions/list');
            return response.data.sourceDefinitions || [];
        } catch (error) {
            throw new Error(`Failed to fetch source definitions: ${error.message}`);
        }
    }

    // Get available destination definitions
    async getDestinationDefinitions() {
        try {
            const response = await this.axiosInstance.get('/destination_definitions/list');
            return response.data.destinationDefinitions || [];
        } catch (error) {
            throw new Error(`Failed to fetch destination definitions: ${error.message}`);
        }
    }

    // Helper method to check if credentials are valid
    async validateCredentials() {
        try {
            await this.getWorkspaces();
            return true;
        } catch (error) {
            return false;
        }
    }

    // Helper method to get workspace details with sources and destinations
    async getWorkspaceDetails(workspaceId) {
        try {
            const [sources, destinations, connections] = await Promise.all([
                this.getSources(workspaceId),
                this.getDestinations(workspaceId),
                this.getConnections(workspaceId),
            ]);

            return {
                workspaceId,
                sources,
                destinations,
                connections,
            };
        } catch (error) {
            throw new Error(`Failed to fetch workspace details: ${error.message}`);
        }
    }
}

module.exports = AirbyteApiService; 