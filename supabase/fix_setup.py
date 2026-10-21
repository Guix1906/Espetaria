import re, pathlib

src = pathlib.Path(r'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_clean.sql')
text = src.read_text(encoding='utf-8')

def wrap_enum(m):
    name = m.group(1)
    body = m.group(2)
    return (
        "DO $$ BEGIN\n"
        f"IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN\n"
        f"CREATE TYPE {name} AS ENUM ({body});\n"
        "END IF;\n"
        "END $$;"
    )

pattern = r'CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^;]*?)\)\s*;'
result = re.sub(pattern, wrap_enum, text, flags=re.DOTALL)

out = pathlib.Path(r'C:\Projetos\Espetaria\Espetaria-main\supabase\setup_complete_safe.sql')
out.write_text(result, encoding='utf-8')
print('OK', len(result))