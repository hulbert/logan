from fabric.api import *


def deploy(bucket=''):
	if (bucket == ''):
		abort('Call like fab deploy:bucket=<bucketname>')
	local("s3cmd sync  ./  s3://{0}/ \
	             --delete-removed \
				 --exclude '.git*' \
				 --exclude '.DS_Store' \
				 --exclude 'fabfile.py' \
				 --exclude '*.pyc'"\
	      .format(bucket));