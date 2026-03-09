-- Create chat_preferences table for storing user's custom chat backgrounds
CREATE TABLE IF NOT EXISTS public.chat_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    background_image_url TEXT,
    background_image_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one preference per user per conversation
    UNIQUE(user_id, conversation_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_chat_preferences_user_id ON public.chat_preferences(user_id);
CREATE INDEX idx_chat_preferences_conversation_id ON public.chat_preferences(conversation_id);

-- Enable Row Level Security
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only read their own preferences
CREATE POLICY "Users can view own chat preferences"
    ON public.chat_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own chat preferences"
    ON public.chat_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own chat preferences"
    ON public.chat_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own preferences
CREATE POLICY "Users can delete own chat preferences"
    ON public.chat_preferences
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_preferences_updated_at
    BEFORE UPDATE ON public.chat_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_preferences_updated_at();
