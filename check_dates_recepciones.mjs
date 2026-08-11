import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkDates() {
    console.log('Checking recepciones_visitas...');
    
    // 1. Get the earliest date
    const { data: earliestData, error: errEarliest } = await supabase
        .from('recepciones_visitas')
        .select('fecha')
        .not('fecha', 'is', null)
        .order('fecha', { ascending: true })
        .limit(1);

    if (errEarliest) {
        console.error('Error fetching earliest date:', errEarliest);
    } else {
        console.log('Earliest record fecha:', earliestData?.[0]?.fecha || 'No data');
    }
    
    // 2. Get the latest date
    const { data: latestData, error: errLatest } = await supabase
        .from('recepciones_visitas')
        .select('fecha')
        .not('fecha', 'is', null)
        .order('fecha', { ascending: false })
        .limit(1);

    if (errLatest) {
        console.error('Error fetching latest date:', errLatest);
    } else {
        console.log('Latest record fecha:', latestData?.[0]?.fecha || 'No data');
    }
    
    // 3. Count records from 2024
    const { count: count2024, error: errCount } = await supabase
        .from('recepciones_visitas')
        .select('*', { count: 'exact', head: true })
        .gte('fecha', '2024-01-01')
        .lte('fecha', '2024-12-31');
        
    if (errCount) {
        console.error('Error counting 2024 data:', errCount);
    } else {
        console.log('Total records in 2024:', count2024);
    }
}

checkDates();
