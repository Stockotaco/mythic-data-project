const express = require('express');
const { knex } = require('../config/database');
const AirbyteApiService = require('../services/airbyteApi');
const logger = require('../utils/logger');

const router = express.Router();

// Get authenticateToken middleware from auth routes
const { authenticateToken } = require('./auth');

// Get all workspaces
router.get('/workspaces', authenticateToken, async (req, res) => {
    try {
        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const workspaces = await airbyteService.getWorkspaces();

        res.json({
            workspaces: workspaces.map(w => ({
                id: w.workspaceId,
                name: w.name,
                slug: w.slug,
                initialSetupComplete: w.initialSetupComplete
            }))
        });

    } catch (error) {
        logger.error('Failed to get workspaces:', error);
        res.status(500).json({ error: 'Failed to get workspaces' });
    }
});

// Get workspace details with sources, destinations, and connections
router.get('/workspaces/:workspaceId', authenticateToken, async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const workspaceDetails = await airbyteService.getWorkspaceDetails(workspaceId);

        res.json({
            workspace: {
                id: workspaceDetails.workspaceId,
                sources: workspaceDetails.sources,
                destinations: workspaceDetails.destinations,
                connections: workspaceDetails.connections
            }
        });

    } catch (error) {
        logger.error('Failed to get workspace details:', error);
        res.status(500).json({ error: 'Failed to get workspace details' });
    }
});

// Get all sources in a workspace
router.get('/workspaces/:workspaceId/sources', authenticateToken, async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const sources = await airbyteService.getSources(workspaceId);

        res.json({
            sources: sources.map(s => ({
                id: s.sourceId,
                name: s.name,
                sourceDefinitionId: s.sourceDefinitionId,
                workspaceId: s.workspaceId,
                connectionConfiguration: s.connectionConfiguration
            }))
        });

    } catch (error) {
        logger.error('Failed to get sources:', error);
        res.status(500).json({ error: 'Failed to get sources' });
    }
});

// Get all destinations in a workspace
router.get('/workspaces/:workspaceId/destinations', authenticateToken, async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const destinations = await airbyteService.getDestinations(workspaceId);

        res.json({
            destinations: destinations.map(d => ({
                id: d.destinationId,
                name: d.name,
                destinationDefinitionId: d.destinationDefinitionId,
                workspaceId: d.workspaceId,
                connectionConfiguration: d.connectionConfiguration
            }))
        });

    } catch (error) {
        logger.error('Failed to get destinations:', error);
        res.status(500).json({ error: 'Failed to get destinations' });
    }
});

// Get all connections in a workspace
router.get('/workspaces/:workspaceId/connections', authenticateToken, async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const connections = await airbyteService.getConnections(workspaceId);

        // Get source and destination names for each connection
        const connectionsWithDetails = await Promise.all(
            connections.map(async (connection) => {
                try {
                    const source = await airbyteService.getSource(connection.sourceId);
                    const destination = await airbyteService.getDestination(connection.destinationId);

                    return {
                        id: connection.connectionId,
                        name: connection.name,
                        sourceId: connection.sourceId,
                        sourceName: source.name,
                        destinationId: connection.destinationId,
                        destinationName: destination.name,
                        status: connection.status,
                        syncCatalog: connection.syncCatalog,
                        schedule: connection.schedule,
                        namespaceDefinition: connection.namespaceDefinition,
                        namespaceFormat: connection.namespaceFormat,
                        prefix: connection.prefix
                    };
                } catch (error) {
                    logger.warn(`Failed to get details for connection ${connection.connectionId}:`, error);
                    return {
                        id: connection.connectionId,
                        name: connection.name,
                        sourceId: connection.sourceId,
                        sourceName: 'Unknown',
                        destinationId: connection.destinationId,
                        destinationName: 'Unknown',
                        status: connection.status,
                        syncCatalog: connection.syncCatalog,
                        schedule: connection.schedule,
                        namespaceDefinition: connection.namespaceDefinition,
                        namespaceFormat: connection.namespaceFormat,
                        prefix: connection.prefix
                    };
                }
            })
        );

        res.json({
            connections: connectionsWithDetails
        });

    } catch (error) {
        logger.error('Failed to get connections:', error);
        res.status(500).json({ error: 'Failed to get connections' });
    }
});

// Get connection details
router.get('/connections/:connectionId', authenticateToken, async (req, res) => {
    try {
        const { connectionId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const connection = await airbyteService.getConnection(connectionId);

        res.json({
            connection
        });

    } catch (error) {
        logger.error('Failed to get connection details:', error);
        res.status(500).json({ error: 'Failed to get connection details' });
    }
});

// Get source definitions
router.get('/source-definitions', authenticateToken, async (req, res) => {
    try {
        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const sourceDefinitions = await airbyteService.getSourceDefinitions();

        res.json({
            sourceDefinitions: sourceDefinitions.map(sd => ({
                id: sd.sourceDefinitionId,
                name: sd.name,
                dockerRepository: sd.dockerRepository,
                dockerImageTag: sd.dockerImageTag,
                documentationUrl: sd.documentationUrl,
                icon: sd.icon,
                releaseStage: sd.releaseStage,
                protocolVersion: sd.protocolVersion,
                sourceType: sd.sourceType
            }))
        });

    } catch (error) {
        logger.error('Failed to get source definitions:', error);
        res.status(500).json({ error: 'Failed to get source definitions' });
    }
});

// Get destination definitions
router.get('/destination-definitions', authenticateToken, async (req, res) => {
    try {
        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const destinationDefinitions = await airbyteService.getDestinationDefinitions();

        res.json({
            destinationDefinitions: destinationDefinitions.map(dd => ({
                id: dd.destinationDefinitionId,
                name: dd.name,
                dockerRepository: dd.dockerRepository,
                dockerImageTag: dd.dockerImageTag,
                documentationUrl: dd.documentationUrl,
                icon: dd.icon,
                releaseStage: dd.releaseStage,
                protocolVersion: dd.protocolVersion,
                destinationType: dd.destinationType
            }))
        });

    } catch (error) {
        logger.error('Failed to get destination definitions:', error);
        res.status(500).json({ error: 'Failed to get destination definitions' });
    }
});

// Test source connection
router.post('/sources/test', authenticateToken, async (req, res) => {
    try {
        const { sourceConfiguration, sourceDefinitionId } = req.body;

        if (!sourceConfiguration || !sourceDefinitionId) {
            return res.status(400).json({ error: 'Source configuration and definition ID are required' });
        }

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const result = await airbyteService.testSourceConnection(sourceConfiguration, sourceDefinitionId);

        res.json({
            success: result.status === 'succeeded',
            message: result.message,
            jobInfo: result.jobInfo
        });

    } catch (error) {
        logger.error('Failed to test source connection:', error);
        res.status(500).json({ error: 'Failed to test source connection' });
    }
});

// Test destination connection
router.post('/destinations/test', authenticateToken, async (req, res) => {
    try {
        const { destinationConfiguration, destinationDefinitionId } = req.body;

        if (!destinationConfiguration || !destinationDefinitionId) {
            return res.status(400).json({ error: 'Destination configuration and definition ID are required' });
        }

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const result = await airbyteService.testDestinationConnection(destinationConfiguration, destinationDefinitionId);

        res.json({
            success: result.status === 'succeeded',
            message: result.message,
            jobInfo: result.jobInfo
        });

    } catch (error) {
        logger.error('Failed to test destination connection:', error);
        res.status(500).json({ error: 'Failed to test destination connection' });
    }
});

// Get source schema
router.get('/sources/:sourceId/schema', authenticateToken, async (req, res) => {
    try {
        const { sourceId } = req.params;

        const user = await knex('users').where('id', req.user.id).first();
        const airbyteService = new AirbyteApiService(user.airbyte_credentials);

        const schema = await airbyteService.getSourceSchema(sourceId);

        res.json({
            schema
        });

    } catch (error) {
        logger.error('Failed to get source schema:', error);
        res.status(500).json({ error: 'Failed to get source schema' });
    }
});

module.exports = router; 