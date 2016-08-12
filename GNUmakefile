# Copyright Omega Noc (C) 2016 Omega Cube and contributors
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
.IGNORE: check-dependencies shinken-prebuild

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

install: dependencies sudoer shinken on-reader hokuto clean

shinken-init: sudoer shinken-install
	shinken --init

debian: debian-prebuild shinken-init install nanto init-daemons

ubuntu: ubuntu-prebuild shinken-init install nanto init-daemons

ubuntu-prebuild:
	@echo "Installing ubunt build"
	echo 'deb http://cran.rstudio.com/bin/linux/ubuntu trusty/' >> /etc/apt/sources.list
	apt-get update
	apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev libcurl4-gnutls-dev libgcrypt11-dev libgnutls-dev libreadline-dev r-base r-base-dev
	useradd --user-group shinken || echo "User shinken already exist" > /dev/null;
	# Install InfluxDB
	wget -O /tmp/influxdb_0.13.0_amd64.deb https://dl.influxdata.com/influxdb/releases/influxdb_0.13.0_amd64.deb
	dpkg -i /tmp/influxdb_0.13.0_amd64.deb
	rm /tmp/influxdb_0.13.0_amd64.deb

debian-prebuild: sudoer
	@echo "Installing debian requirements"
	apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev libcurl4-gnutls-dev libgcrypt20-dev gnutls-dev libreadline-dev r-base r-base-dev
	useradd --user-group shinken || echo "User shinken already exist" > /dev/null;
	# Install InfluxDB
	wget -O /tmp/influxdb_0.13.0_amd64.deb https://dl.influxdata.com/influxdb/releases/influxdb_0.13.0_amd64.deb
	dpkg -i /tmp/influxdb_0.13.0_amd64.deb
	rm /tmp/influxdb_0.13.0_amd64.deb

init-daemons: sudoer
	sed -i "s/modules.*/modules	influxdb, livestatus, hokuto/g" /etc/shinken/brokers/broker-master.cfg
	sed -i "s/modules.*/modules	named-pipe, PickleRetentionArbiter/g" /etc/shinken/arbiters/arbiter-master.cfg
	cp hokuto/etc/init.d/hokuto /etc/init.d/hokuto
	cp nanto/etc/init.d/nanto /etc/init.d/nanto
	update-rc.d hokuto defaults
	update-rc.d nanto defaults
	update-rc.d shinken defaults
	/etc/init.d/shinken start
	/etc/init.d/nanto start
	/etc/init.d/hokuto start
	/etc/init.d/cron restart
	chown shinken:shinken /var/lib/shinken/hokuto.db
	chown -R shinken:shinken /tmp/shinken
	chown shinken:shinken /var/log/shinken/arbiterd.log

centos: centos-prebuild shinken-init install nanto systemd-daemons

centos-prebuild: sudoer
	@echo "Installing centos build"
	curl https://bitbucket.org/pypa/setuptools/raw/bootstrap/ez_setup.py | python -
	curl https://raw.github.com/pypa/pip/master/contrib/get-pip.py | python -
	easy_install pip
	rpm -Uvh https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
	yum update
	yum install sqlite graphviz graphviz-devel gcc gcc-c++ python-devel libxml2-devel readline-devel R
	useradd --user-group shinken || echo "User shinken already exist" > /dev/null;
	curl -o /tmp/influxdb_0.13.0_amd64.deb https://dl.influxdata.com/influxdb/releases/influxdb-0.13.0.x86_64.rpm
	yup localinstall /tmp/influxdb_0.13.0_amd64.deb

systemd-daemons:
	@echo "Cleaning centos install"
	sed -i "s/modules.*/modules	influxdb, livestatus, hokuto/g" /etc/shinken/brokers/broker-master.cfg
	sed -i "s/modules.*/modules	named-pipe, PickleRetentionArbiter/g" /etc/shinken/arbiters/arbiter-master.cfg
	cp vendor/scripts/shinken-systemd.service /etc/systemd/system/shinken.service
	cp hokuto/etc/systemd/system/hokuto.service /etc/systemd/system/hokuto.service
	cp hokuto/etc/systemd/system/hokuto.sh /usr/bin/hokuto.sh
	chmod +x /usr/bin/hokuto.sh
	cp nanto/etc/systemd/system/nanto.service /etc/systemd/system/nanto.service
	cp nanto/etc/systemd/system/nanto.sh /usr/bin/nanto.sh
	chmod +x /usr/bin/nanto.sh
	systemctl enable shinken.service
	systemctl enable hokuto.service
	systemctl enable nanto.service
	systemctl start hokuto.service
	systemctl start shinken.service
	systemctl start nanto.service

	systemctl restart crond
	chown shinken:shinken /var/lib/shinken/hokuto.db
	chown -R shinken:shinken /tmp/shinken
	chown shinken:shinken /var/log/shinken/arbiterd.log

configure-influx:
	influx -execute "CREATE DATABASE shinken"
	influx -execute "CREATE USER shinken WITH PASSWORD 'shinken'"
	influx -execute "GRANT ALL ON shinken TO shinken"

dependencies: shinken-dependencies influxdb-dependencies

check-dependencies:
	@echo "Checking global dependencies..."
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken, please run 'make shinken-install'"; exit 1;}
	@command -v R 2>&1 || { echo >&2 "Missing R"; exit 1;}
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

clean: on-reader-clean

#tools
#update script
update: sudoer
	@python hokuto/module/update.py
	@echo "Updating hokuto files"
	cp -r hokuto/standalone/* /usr/local/hokuto

import-sla: sudoer
	@sqlite3 /var/lib/shinken/hokuto.db "CREATE TABLE IF NOT EXISTS sla (id INTEGER NOT NULL, host_name VARCHAR(128) NOT NULL, service_description VARCHAR(32), time INTEGER NOT NULL, state INTEGER, PRIMARY KEY (id));"
	@python hokuto/module/import_sla.py


# InfluxDB
influxdb-dependencies:
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

influxdb: influxdb-prebuild influxdb-dependencies sudoer
	pip install 'influxdb==3.0.0'

#shinken
shinken-dependencies:
	# Checks that Shinken is installed
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken"; exit 1;}

shinken-install-dependencies: sudoer
	@echo -n "\033]0;Installing shinken plugins dependencies\007"
	pip install pycurl 'flask==0.10.1' 'flask-login==0.2.11' 'flask-sqlalchemy==2.0' 'flask-babel==0.9' 'python-igraph==0.7' wtforms 'flask-assets==0.10' 'whisper==0.9.13' 'Twisted<12.0' 'networkx==1.10rc2' 'graphviz==0.4.5' 'pygraphviz==1.3rc2' 'python-mk-livestatus==0.4' 'gunicorn==19.3.0' pynag chardet

shinken-install-plugins: sudoer vendors
	@mkdir -p /var/lib/shinken/share && chown shinken:shinken /var/lib/shinken/share
	@echo -n "\033]0;Installing shinken - livestatus plugin\007"
	shinken install --local vendor/livestatus
	@echo -n "\033]0;Installing shinken - InfluxDB plugin\007"
	shinken install influxdb
	sed -i "s/user.*/user            shinken/g" /etc/shinken/modules/influxdb.cfg
	sed -i "s/password.*/password        shinken/g" /etc/shinken/modules/influxdb.cfg
	@echo -n "\033]0;Installing shinken - logstore-sqlite plugin\007"
	shinken install --local vendor/logstore-sqlite
	@echo -n "\033]0;Installing shinken - hokuto plugin\007"
	shinken install --local hokuto
	@echo -n "\033]0;Installing shinken - named pipe\007"
	shinken install named-pipe
	@echo -n "\033]0;Installing shinken - pickle retention\007"
	shinken install pickle-retention-file-generic

shinken: shinken-prebuild shinken-install-dependencies shinken-install-plugins
	@echo Omeganoc have been succefully installed
	@echo Add "'modules influxdb, livestatus, hokuto'" to your broker-master.cfg file
	@echo Add modules named-pipe, PickleRetentionArbiter to your arbiter-master.cfg file
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

# Checks that R is installed
nanto-dependencies:
	@command -v Rscript 2>&1 || { echo >&2 "Missing R"; exit 1; }

# Installs R and Python libraries required by the default forecasting scripts
nanto-libs: sudoer
	Rscript -e "install.packages('forecast', repos='http://cran.r-project.org')"
	Rscript -e "install.packages('changepoint', repos='http://cran.r-project.org')"
	pip install singledispatch rpy2 python-daemon

#libs
watcher: sudoer
	@echo -n "\033]0;Installing hokuto-watcher scripts.\007"
	@echo -n "Installing watcher and cron routine...\n"
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
influxdb-prebuild:
	@echo -n "\033]0;Installing InfluxDB python API/\007"
shinken-prebuild:
	@echo -n "\033]0;Configuring shinken\007"

#TODO
# python-igraph
