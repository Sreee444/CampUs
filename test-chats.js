require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function testFetch() {
    console.log("Checking mentorship requests...");
    const { data: reqs } = await supabase.from('mentorship_requests').select('*');
    console.log(reqs);

    console.log("Checking mentorship chat participants...");
    const { data: parts } = await supabase.from('mentorship_chat_participants').select('*');
    console.log(parts);

    console.log("Checking mentorship chats...");
    const { data: chats } = await supabase.from('mentorship_chats').select('*');
    console.log(chats);
}
testFetch();
