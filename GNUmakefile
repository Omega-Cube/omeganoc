# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Nicolas Lantoing, nicolas@omegacube.fr
# Xavier Roger-Machart, xrm@omegacube.fr
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

SHELL = /bin/sh
WHOAMI = $(shell whoami)

#clear out the suffix list
.SUFFIXES:
.IGNORE: check-dependencies graphite-prebuild shinken-prebuild

#prevent up-to-date return
.PHONY: mock help default install debian centos clean test

default: help

help:
	@echo "Commands\n"
	@egrep -o "(^[a-z]+):" ./GNUmakefile

sudoer:
	@if [ $(WHOAMI) != root ]; then \
		echo "Please run this script as root or with sudo"; \
		exit 1; \
	fi

install: dependencies sudoer graphite shinken on-reader hokuto clean

shinken-init: sudoer shinken-install
	shinken --init

debian: debian-prebuild shinken-init install init-daemons

ubuntu: ubuntu-prebuild shinken-init install init-daemons

ubuntu-prebuild:
	@echo "Installing ubunt build"
	apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev libcurl4-gnutls-dev libgcrypt11-dev libgnutls-dev
	useradd --user-group shinken

debian-prebuild: sudoer
	@echo "Installing debian build"
	apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev libcurl4-gnutls-dev libgcrypt20-dev gnutls-dev
	useradd --user-group shinken

init-daemons: sudoer
	@echo "Cleaning debian specific files"
	sed -i "s/modules.*/modules	graphite, livestatus, hokuto/g" /etc/shinken/brokers/broker-master.cfg
	cp vendor/scripts/carbon-cache-init.sh /etc/init.d/carbon-cache
	cp hokuto/etc/init.d/hokuto /etc/init.d/hokuto
	update-rc.d carbon-cache defaults
	update-rc.d hokuto defaults
	update-rc.d shinken defaults
	/etc/init.d/carbon-cache start
	/etc/init.d/shinken start
	/etc/init.d/hokuto start
	/etc/init.d/cron restart
	chown shinken:shinken /var/lib/shinken/hokuto.db
	chown -R shinken:shinken /tmp/shinken

centos: centos-prebuild shinken-init install systemd-daemons

centos-prebuild: sudoer
	@echo "Installing centos build"
	curl https://bitbucket.org/pypa/setuptools/raw/bootstrap/ez_setup.py | python -
	curl https://raw.github.com/pypa/pip/master/contrib/get-pip.py | python -
	easy_install pip
	yum install sqlite graphviz graphviz-devel gcc gcc-c++ python-devel libxml2-devel
	useradd --user-group shinken

systemd-daemons:
	@echo "Cleaning centos install"
	sed -i "s/modules.*/modules	graphite, livestatus, hokuto/g" /etc/shinken/brokers/broker-master.cfg
	cp vendor/scripts/carbon-cache-systemd.service /etc/systemd/system/carbon-cache.service
	cp vendor/scripts/carbon-cache-systemd.sh /usr/bin/carbon-cache.sh
	chmod +x /usr/bin/carbon-cache.sh
	cp vendor/scripts/shinken-systemd.service /etc/systemd/system/shinken.service
	cp hokuto/etc/systemd/system/hokuto.service /etc/systemd/system/hokuto.service
	cp hokuto/etc/systemd/system/hokuto.sh /usr/bin/hokuto.sh
	chmod +x /usr/bin/hokuto.sh
	systemctl enable carbon-cache.service
	systemctl enable shinken.service
	systemctl enable hokuto.service
	systemctl start hokuto.service
	systemctl start carbon-cache.service
	systemctl start shinken.service

	systemctl restart crond
	chown shinken:shinken /var/lib/shinken/hokuto.db
	chown -R shinken:shinken /tmp/shinken


dependencies: shinken-dependencies graphite-dependencies

check-dependencies:
	@echo "Checking global dependencies..."
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken, please run 'make shinken-install'"; exit 1;}
	@command -v R 2>&1 || { echo >&2 "Missing R"; exit 1;}
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

clean: on-reader-clean

#tools
import-sla: sudoer
	@sqlite3 /var/lib/shinken/hokuto.db "CREATE TABLE IF NOT EXISTS sla (id INTEGER NOT NULL, host_name VARCHAR(128) NOT NULL, service_description VARCHAR(32), time INTEGER NOT NULL, state INTEGER, PRIMARY KEY (id));"
	@python hokuto/module/import_sla.py


#graphite
graphite-dependencies:
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

graphite: graphite-prebuild graphite-dependencies sudoer
	pip install 'graphite-query==0.11.3'

#shinken
shinken-dependencies:
	# Checks that Shinken is installed
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken"; exit 1;}

shinken-install-dependencies: sudoer
	@echo -n "\033]0;Installing shinken plugins dependencies\007"
	pip install pycurl 'flask==0.10.1' 'flask-login==0.2.11' 'flask-sqlalchemy==2.0' 'flask-babel==0.9' 'python-igraph==0.7' wtforms 'flask-assets==0.10' 'whisper==0.9.13' carbon 'Twisted<12.0' 'networkx==1.10rc2' 'graphviz==0.4.5' 'pygraphviz==1.3rc2' 'graphite-query==0.11.3' 'python-mk-livestatus==0.4' 'gunicorn==19.3.0' pynag chardet

shinken-install-plugins: sudoer vendors
	@mkdir -p /var/lib/shinken/share && chown shinken:shinken /var/lib/shinken/share
	-useradd --user-group graphite
	@echo -n "\033]0;Installing shinken - livestatus plugin\007"
	shinken install --local vendor/livestatus
	@echo -n "\033]0;Installing shinken - graphite plugin\007"
	shinken install graphite
	@echo -n "\033]0;Installing shinken - logstore-sqlite plugin\007"
	shinken install --local vendor/logstore-sqlite
	@echo -n "\033]0;Installing shinken - hokuto plugin\007"
	shinken install --local hokuto

shinken-plugins-config: sudoer watcher
	@echo -n "\033]0;Initialize livestatus config files\007"
	@if ! ls /opt/graphite/conf/carbon.conf >/dev/null 2>&1; then\
		cp /opt/graphite/conf/carbon.conf.example /opt/graphite/conf/carbon.conf; \
	fi
	@if ! ls /opt/graphite/conf/storage-schemas.conf >/dev/null 2>&1; then\
		cp /opt/graphite/conf/storage-schemas.conf.example /opt/graphite/conf/storage-schemas.conf; \
	fi

shinken: shinken-prebuild shinken-install-dependencies shinken-install-plugins shinken-plugins-config
	@echo Omeganoc have been succefully installed
	@echo Add "'modules graphite, livestatus, hokuto'" to your broker-master.cfg file
	@echo Add modules logstore-sqlite to livestatus.cfg.

# Hokuto - Copy hokuto files to their install directory
hokuto: sudoer
	@echo Installing Hokuto
	@mkdir -p /usr/local/hokuto
	cp -r hokuto/standalone/* /usr/local/hokuto
	cp hokuto/etc/hokuto.cfg /etc/hokuto.cfg

#install shinken from sources
vendors:
	@if ! ls vendor/shinken >/dev/null 2>&1; then echo "Missing vendors file, please run 'git submodules update'" & exit 1; fi

shinken-install: vendors sudoer
	@cd vendor/shinken && python setup.py install clean

# Nanto
nanto: nanto-dependencies nanto-libs
	cp -r nanto/src /usr/local/nanto
	cp nanto/etc/nanto.cfg /etc/nanto.cfg

nanto-dependencies:
	# Checks that R is installed
	@command -v Rscript 2>&1 || { echo >&2 "Missing R"; exit 1; }

nanto-libs: sudoer
	# Installs R and Python libraries required by the default forecasting scripts
	Rscript -e "install.packages('forecast', repos='http://cran.r-project.org')"
	Rscript -e "install.packages('changepoint', repos='http://cran.r-project.org')"
	pip install singledispatch rpy2 python-daemon
	
#libs
watcher: sudoer
	@echo -n "\033]0;Installing hokuto-watcher scripts.\007"
	@echo -n "Installing cron routine and restarting cron service...\n"
	@cp hokuto/shinken_watcher.py /usr/local/bin/
	@cp hokuto/mplock.py /usr/local/bin/
	@grep -q 'shinken_watcher.py' /etc/crontab || echo '*  *    * * *   root    /usr/local/bin/shinken_watcher.py' >> /etc/crontab

on-reader: sudoer
	@echo -n "\033]0;Installing livestatus libraries.\007"
	@cd lib/on_reader && python setup.py install

on-reader-clean: sudoer
	@cd lib/on_reader && python setup.py clean
	@rm -rf lib/on_reader/build

#prebuilds messages
graphite-prebuild:
	@echo -n "\033]0;Installing graphite python API/\007"
shinken-prebuild:
	@echo -n "\033]0;Configuring shinken\007"

#TODO
# python-igraph
