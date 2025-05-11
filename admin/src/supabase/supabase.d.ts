export function initSupabase(env: {
    SUPABASE_URL: string,
    SUPABASE_ANON_KEY: string
}): void;

export function createOrUpdateCompany(
    companyId: string,
    companyName: string,
    accessToken: string,
    refreshToken: string,
    companyDetails: {
        name: string,
        email: string | null,
        timezone: string | null,
        relationshipNumber: string | null,
        currency: string | null,
        customerType: string | null,
        dateAdded: string | null,
        status: string | null,
        locationCount: number | null
    }
): Promise<any>; 