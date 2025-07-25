const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { knex } = require('../config/database');
const { encryptData, generateUUID } = require('../config/database');
const AirbyteApiService = require('../services/airbyteApi');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().min(2).required(),
    airbyte_credentials: Joi.object({
        username: Joi.string().required(),
        password: Joi.string().required(),
    }).required(),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

const updateCredentialsSchema = Joi.object({
    airbyte_credentials: Joi.object({
        username: Joi.string().required(),
        password: Joi.string().required(),
    }).required(),
});

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await knex('users').where('id', decoded.userId).first();

        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Invalid or inactive user' });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Register new user
router.post('/register', async (req, res) => {
    try {
        // Validate request body
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, password, name, airbyte_credentials } = value;

        // Check if user already exists
        const existingUser = await knex('users').where('email', email).first();
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Validate Airbyte credentials
        const airbyteService = new AirbyteApiService(airbyte_credentials);
        const isValidCredentials = await airbyteService.validateCredentials();

        if (!isValidCredentials) {
            return res.status(400).json({ error: 'Invalid Airbyte credentials' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Encrypt Airbyte credentials
        const encryptedCredentials = encryptData(airbyte_credentials);

        // Create user
        const userId = generateUUID();
        const user = await knex('users').insert({
            id: userId,
            email,
            password_hash: passwordHash,
            name,
            airbyte_credentials: encryptedCredentials,
            is_active: true,
        }).returning(['id', 'email', 'name', 'created_at']);

        // Generate JWT token
        const token = jwt.sign(
            { userId: user[0].id, email: user[0].email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        logger.info(`New user registered: ${email}`);

        res.status(201).json({
            message: 'User registered successfully',
            user: user[0],
            token
        });

    } catch (error) {
        logger.error('Registration failed:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        // Validate request body
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, password } = value;

        // Find user
        const user = await knex('users').where('email', email).first();
        if (!user || !user.is_active) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        logger.info(`User logged in: ${email}`);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                created_at: user.created_at
            },
            token
        });

    } catch (error) {
        logger.error('Login failed:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await knex('users')
            .where('id', req.user.id)
            .select(['id', 'email', 'name', 'created_at', 'updated_at'])
            .first();

        res.json({
            user
        });

    } catch (error) {
        logger.error('Failed to get user profile:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;

        // Validate email if provided
        if (email) {
            const emailSchema = Joi.string().email();
            const { error } = emailSchema.validate(email);
            if (error) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // Check if email is already taken
            const existingUser = await knex('users')
                .where('email', email)
                .whereNot('id', req.user.id)
                .first();

            if (existingUser) {
                return res.status(409).json({ error: 'Email already in use' });
            }
        }

        // Update user
        const updateData = {
            updated_at: new Date()
        };

        if (name) updateData.name = name;
        if (email) updateData.email = email;

        const updatedUser = await knex('users')
            .where('id', req.user.id)
            .update(updateData)
            .returning(['id', 'email', 'name', 'created_at', 'updated_at']);

        logger.info(`User profile updated: ${req.user.email}`);

        res.json({
            message: 'Profile updated successfully',
            user: updatedUser[0]
        });

    } catch (error) {
        logger.error('Failed to update user profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Update Airbyte credentials
router.put('/airbyte-credentials', authenticateToken, async (req, res) => {
    try {
        // Validate request body
        const { error, value } = updateCredentialsSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { airbyte_credentials } = value;

        // Validate Airbyte credentials
        const airbyteService = new AirbyteApiService(airbyte_credentials);
        const isValidCredentials = await airbyteService.validateCredentials();

        if (!isValidCredentials) {
            return res.status(400).json({ error: 'Invalid Airbyte credentials' });
        }

        // Encrypt and update credentials
        const encryptedCredentials = encryptData(airbyte_credentials);

        await knex('users')
            .where('id', req.user.id)
            .update({
                airbyte_credentials: encryptedCredentials,
                updated_at: new Date()
            });

        logger.info(`Airbyte credentials updated for user: ${req.user.email}`);

        res.json({
            message: 'Airbyte credentials updated successfully'
        });

    } catch (error) {
        logger.error('Failed to update Airbyte credentials:', error);
        res.status(500).json({ error: 'Failed to update Airbyte credentials' });
    }
});

// Test Airbyte credentials
router.post('/test-airbyte-credentials', authenticateToken, async (req, res) => {
    try {
        // Validate request body
        const { error, value } = updateCredentialsSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { airbyte_credentials } = value;

        // Test Airbyte credentials
        const airbyteService = new AirbyteApiService(airbyte_credentials);

        try {
            const workspaces = await airbyteService.getWorkspaces();

            res.json({
                message: 'Airbyte credentials are valid',
                workspaces_count: workspaces.length,
                workspaces: workspaces.map(w => ({
                    id: w.workspaceId,
                    name: w.name
                }))
            });

        } catch (airbyteError) {
            res.status(400).json({
                error: 'Invalid Airbyte credentials',
                details: airbyteError.message
            });
        }

    } catch (error) {
        logger.error('Failed to test Airbyte credentials:', error);
        res.status(500).json({ error: 'Failed to test Airbyte credentials' });
    }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validate new password
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters long' });
        }

        // Verify current password
        const user = await knex('users').where('id', req.user.id).first();
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await knex('users')
            .where('id', req.user.id)
            .update({
                password_hash: newPasswordHash,
                updated_at: new Date()
            });

        logger.info(`Password changed for user: ${req.user.email}`);

        res.json({
            message: 'Password changed successfully'
        });

    } catch (error) {
        logger.error('Failed to change password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router; 