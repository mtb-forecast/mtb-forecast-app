
ALTER TABLE public.trilhas
ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_trilhas_created_by ON public.trilhas(created_by);
