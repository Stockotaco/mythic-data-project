/**
 * Database utility functions for handling user and location data
 */

/**
 * Update user data in the existing public.users table
 * This updates user data that is shared across all locations
 * Note: The user record should already exist from Supabase auth trigger
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} email - Normalized email address
 * @param {Object} userData - Decrypted user data from HighLevel
 */
export async function upsertUserData(supabase, userId, email, userData) {
    // Check if user exists first
    const { data: existingUser } = await supabase
        .from('users')
        .select('id, first_login_at')
        .eq('id', userId)
        .single();

    const updateRecord = {
        email: email,
        highlight_user_name: userData.userName || null,
        full_name: userData.userName || null, // Update full_name with HighLevel name
        metadata: userData,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Set first_login_at only if it's not already set
    if (existingUser && !existingUser.first_login_at) {
        updateRecord.first_login_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from('users')
        .update(updateRecord)
        .eq('id', userId)
        .select();

    if (error) {
        console.error('Error updating user data:', error);
        throw error;
    }

    return data;
}

/**
 * Upsert user location association into the public.user_locations table
 * This handles the many-to-many relationship and stores location-specific data
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} email - Normalized email address
 * @param {Object} userData - Full user data from HighLevel
 */
export async function upsertUserLocation(supabase, userId, email, userData) {
    if (!userData.locationId) {
        return null; // No location to associate
    }

    const locationRecord = {
        user_id: userId,
        location_id: userData.locationId,
        email: email,
        highlevel_user_id: userData.userId || null,
        highlevel_company_id: userData.companyId || null,
        highlevel_role: userData.role || null,
        highlevel_type: userData.type || null,
        location_metadata: userData,
        is_active: true,
        last_accessed_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('user_locations')
        .upsert(locationRecord, {
            onConflict: 'user_id,location_id'
        })
        .select();

    if (error) {
        console.error('Error upserting user location:', error);
        throw error;
    }

    return data;
}

/**
 * Get user preferences and data
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 */
export async function getUserData(supabase, userId) {
    const { data, error } = await supabase
        .from('users')
        .select(`
            *,
            user_locations (
                location_id,
                created_at
            )
        `)
        .eq('id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user data:', error);
        throw error;
    }

    return data;
}

/**
 * Update user preferences
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {Object} preferences - User preferences object
 */
export async function updateUserPreferences(supabase, userId, preferences) {
    const { data, error } = await supabase
        .from('users')
        .update({ 
            preferences: preferences,
            updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select();

    if (error) {
        console.error('Error updating user preferences:', error);
        throw error;
    }

    return data;
}

/**
 * Get all locations for a user
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {boolean} activeOnly - Only return active locations
 */
export async function getUserLocations(supabase, userId, activeOnly = true) {
    let query = supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', userId);

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user locations:', error);
        throw error;
    }

    return data;
}

/**
 * Get user data for a specific location
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} locationId - Location ID
 */
export async function getUserLocationData(supabase, userId, locationId) {
    const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .eq('is_active', true)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user location data:', error);
        throw error;
    }

    return data;
}

/**
 * Deactivate user access to a location
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} locationId - Location ID
 */
export async function deactivateUserLocation(supabase, userId, locationId) {
    const { data, error } = await supabase
        .from('user_locations')
        .update({
            is_active: false,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .select();

    if (error) {
        console.error('Error deactivating user location:', error);
        throw error;
    }

    return data;
}

/**
 * Upsert user company association into the public.user_companies table
 * This handles the many-to-many relationship and stores company-specific data
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} email - Normalized email address
 * @param {Object} userData - Full user data from HighLevel
 */
export async function upsertUserCompany(supabase, userId, email, userData) {
    if (!userData.companyId) {
        return null; // No company to associate
    }

    const companyRecord = {
        user_id: userId,
        company_id: userData.companyId,
        email: email,
        highlevel_user_id: userData.userId || null,
        highlevel_role: userData.role || null,
        highlevel_type: userData.type || null,
        company_metadata: userData,
        is_active: true,
        last_accessed_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('user_companies')
        .upsert(companyRecord, {
            onConflict: 'user_id,company_id'
        })
        .select();

    if (error) {
        console.error('Error upserting user company:', error);
        throw error;
    }

    return data;
}

/**
 * Get all companies for a user
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {boolean} activeOnly - Only return active companies
 */
export async function getUserCompanies(supabase, userId, activeOnly = true) {
    let query = supabase
        .from('user_companies')
        .select('*')
        .eq('user_id', userId);

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user companies:', error);
        throw error;
    }

    return data;
}

/**
 * Get user data for a specific company
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} companyId - Company ID
 */
export async function getUserCompanyData(supabase, userId, companyId) {
    const { data, error } = await supabase
        .from('user_companies')
        .select('*')
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user company data:', error);
        throw error;
    }

    return data;
}

/**
 * Deactivate user access to a company
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - Auth user ID
 * @param {string} companyId - Company ID
 */
export async function deactivateUserCompany(supabase, userId, companyId) {
    const { data, error } = await supabase
        .from('user_companies')
        .update({
            is_active: false,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('company_id', companyId)
        .select();

    if (error) {
        console.error('Error deactivating user company:', error);
        throw error;
    }

    return data;
}