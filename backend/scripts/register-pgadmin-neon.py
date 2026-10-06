"""Register the requested Neon live connection through pgAdmin's supported importer."""
import os,sys,json,sqlite3,datetime,builtins
from pathlib import Path
project=Path(__file__).resolve().parents[2]
definition=project/'backend'/'data'/'pgadmin-neon-live.json'
pgadmin=Path('C:/Program Files/PostgreSQL/18/pgAdmin 4/web')
native_bins=[str(pgadmin.parent/'runtime'),'C:/Program Files/PostgreSQL/18/bin']
os.environ['PATH']=os.pathsep.join(native_bins+[os.environ.get('PATH','')])
dll_handles=[os.add_dll_directory(folder) for folder in native_bins]
config_db=Path(os.environ['APPDATA'])/'pgAdmin'/'pgadmin4.db'
if '--verify-only' in sys.argv:
    import subprocess,psycopg
    expected=json.loads(definition.read_text())['Servers']['1']
    with sqlite3.connect(config_db.as_uri()+'?mode=ro',uri=True) as saved:
        saved.row_factory=sqlite3.Row
        row=saved.execute('SELECT * FROM server WHERE name=?',(expected['Name'],)).fetchone()
    if row is None or row['host']!=expected['Host'] or row['passexec_cmd']!=expected['PasswordExecCommand']:
        raise RuntimeError('Registered connection differs from the application settings')
    password=subprocess.run(row['passexec_cmd'],shell=True,capture_output=True,text=True,check=True).stdout.strip()
    with psycopg.connect(host=row['host'],port=row['port'],dbname=row['maintenance_db'],user=row['username'],password=password,sslmode='require',connect_timeout=20) as connection:
        with connection.cursor() as cursor:
            cursor.execute(row['post_connection_sql'])
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='medsense_app' AND table_type='BASE TABLE' ORDER BY table_name")
            tables=[item[0] for item in cursor.fetchall()]
            from psycopg import sql
            counts={}
            for table in tables:
                cursor.execute(sql.SQL('SELECT count(*) FROM {}.{}').format(sql.Identifier('medsense_app'),sql.Identifier(table)))
                counts[table]=cursor.fetchone()[0]
    print(json.dumps({'server':row['name'],'database':row['maintenance_db'],'schema':'medsense_app','connection':'PASS','tables':len(tables),'counts':counts}))
    sys.exit(0)
backup=project/'database'/('pgadmin-config-before-neon-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.db')
with sqlite3.connect(config_db.as_uri()+'?mode=ro',uri=True) as original,sqlite3.connect(backup) as copy:
    original.backup(copy)
print('pgAdmin configuration backed up.',flush=True)
builtins.SERVER_MODE=False
sys.path.insert(0,str(pgadmin))
import config
config.SQLITE_PATH=str(config_db)
from pgadmin import create_app
from pgadmin.model import Server
from pgadmin.utils import load_database_servers
app=create_app(config.APP_NAME+'-cli')
with app.test_request_context():
    server=Server.query.filter_by(name='MedSenseAI LIVE - Neon (medsense_app)').first()
    if server is None:
        load_database_servers(str(definition),None,config.DESKTOP_USER,True,'internal')
        server=Server.query.filter_by(name='MedSenseAI LIVE - Neon (medsense_app)').first()
    if server is None or not server.passexec_cmd:
        raise RuntimeError('Live server/password provider was not registered')
    # Test exactly the registered desktop password provider and TLS connection.
    from pgadmin.utils.passexec import PasswordExec
    password=PasswordExec(server.passexec_cmd,server.host,server.port,server.username).get()
    import psycopg
    with psycopg.connect(host=server.host,port=server.port,dbname=server.maintenance_db,user=server.username,password=password,sslmode='require',connect_timeout=20) as connection:
        with connection.cursor() as cursor:
            cursor.execute(server.post_connection_sql)
            cursor.execute('SELECT current_database(),current_schema(),(SELECT count(*) FROM brand),(SELECT count(*) FROM supplier_info),(SELECT count(*) FROM product),(SELECT count(*) FROM customer),(SELECT count(*) FROM invoice),(SELECT count(*) FROM invoice_return)')
            values=cursor.fetchone()
            cursor.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='medsense_app' AND table_type='BASE TABLE'")
            tables=cursor.fetchone()[0]
    print(json.dumps({'server':server.name,'database':values[0],'schema':values[1],'brands':values[2],'suppliers':values[3],'products':values[4],'customers':values[5],'orders':values[6],'returns':values[7],'tables':tables,'connection':'PASS','configBackup':str(backup)}))
