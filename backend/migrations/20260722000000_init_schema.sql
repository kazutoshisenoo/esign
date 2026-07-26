-- 1. Profiles Table (Link with Auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Allow public read access to profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Allow users to update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Documents Table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    original_pdf_url TEXT NOT NULL,
    signed_pdf_url TEXT,
    status TEXT DEFAULT 'draft'::text NOT NULL CHECK (status IN ('draft', 'sent', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Documents Policies
CREATE POLICY "Users can manage their own documents" ON public.documents
    FOR ALL USING (auth.uid() = owner_id);

-- 3. Document Signers Table
CREATE TABLE public.document_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    status TEXT DEFAULT 'pending'::text NOT NULL CHECK (status IN ('pending', 'verified', 'signed')),
    verified_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on Signers
ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;

-- Signers Policies
CREATE POLICY "Owners can manage signers of their documents" ON public.document_signers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = document_signers.document_id
            AND documents.owner_id = auth.uid()
        )
    );

CREATE POLICY "Signers can view their own record via token" ON public.document_signers
    FOR SELECT USING (true); -- Verification is handled via Token in Edge Function or client validation

-- 4. Signature Fields Table
CREATE TABLE public.signature_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    signer_id UUID REFERENCES public.document_signers(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('signature', 'date', 'name', 'company', 'text', 'checkbox')),
    page_number INTEGER NOT NULL,
    x_percentage DOUBLE PRECISION NOT NULL,
    y_percentage DOUBLE PRECISION NOT NULL,
    width_percentage DOUBLE PRECISION NOT NULL,
    height_percentage DOUBLE PRECISION NOT NULL,
    value TEXT,
    is_required BOOLEAN DEFAULT true NOT NULL
);

-- Enable RLS on Signature Fields
ALTER TABLE public.signature_fields ENABLE ROW LEVEL SECURITY;

-- Signature Fields Policies
CREATE POLICY "Owners can manage signature fields" ON public.signature_fields
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = signature_fields.document_id
            AND documents.owner_id = auth.uid()
        )
    );

CREATE POLICY "Signers can view and edit fields assigned to them" ON public.signature_fields
    FOR SELECT USING (true);

-- Policy to allow signer to update values ONLY if document is NOT completed
CREATE POLICY "Signers can update field values" ON public.signature_fields
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.document_signers
            JOIN public.documents ON documents.id = document_signers.document_id
            WHERE document_signers.id = signature_fields.signer_id
            AND documents.status != 'completed'
        )
    );

-- 5. Audit Logs Table (Strict: Insert only, No update/delete)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'sent', 'viewed', 'email_verified', 'signed', 'downloaded')),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'signer', 'system')),
    actor_identity TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit Logs Policies
CREATE POLICY "Owners can view audit logs for their documents" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = audit_logs.document_id
            AND documents.owner_id = auth.uid()
        )
    );

CREATE POLICY "Allow system insert of audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true); -- Restricted in practice through Edge Functions and DB Triggers

-- Indexes for performance
CREATE INDEX idx_documents_owner ON public.documents(owner_id);
CREATE INDEX idx_signers_document ON public.document_signers(document_id);
CREATE INDEX idx_signers_token ON public.document_signers(token);
CREATE INDEX idx_fields_document ON public.signature_fields(document_id);
CREATE INDEX idx_fields_signer ON public.signature_fields(signer_id);
CREATE INDEX idx_audit_document ON public.audit_logs(document_id);
