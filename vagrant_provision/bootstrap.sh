#!/usr/bin/env bash

export DEBIAN_FRONTEND=noninteractive
export PERL_MM_USE_DEFAULT=true

# Add repositories for R
sed -i '$ a\deb http://cran.univ-lyon1.fr/bin/linux/debian jessie-cran3/' /etc/apt/sources.list
apt-key adv --keyserver keys.gnupg.net --recv-key 381BA480

aptitude -q update
aptitude -y -q full-upgrade
aptitude -y -q install vim git snmpd python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev r-base-core liblzma-dev

# Configure snmpd
cp /vagrant/vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
service snmpd restart

# Configure PERL for the SNMP probes
cpan install Net::SNMP

useradd --user-group shinken
pip install pycurl cherrypy
cd /vagrant
git submodule init
git submodule update
make shinken-install

# Initialize Shinken
shinken --init
shinken install linux-snmp

# Fix a missing file in linux-snmp
cp /vagrant/vagrant_provision/utils.pm.template /var/lib/shinken/libexec/utils.pm

# Configure Shinken
cp /vagrant/vagrant_provision/broker-master.cfg.template /etc/shinken/brokers/broker-master.cfg
cp /vagrant/vagrant_provision/localhost.cfg.template /etc/shinken/hosts/localhost.cfg
cp /vagrant/vagrant_provision/livestatus.cfg.template /etc/shinken/modules/livestatus.cfg

# Launch the installer
# We do not use the "install" target because we we to create symlinks to the development files
# instead of copies to facilitate development.
make shinken on-reader nanto-libs clean

# Create symbolic links for Hokuto
#TODO : Remove files before replacing with the links
rm -rf /usr/local/hokuto
ln -s /vagrant/hokuto/standalone /usr/local/hokuto
rm /etc/hokuto.cfg
ln -s /vagrant/hokuto/etc/hokuto.cfg /etc/hokuto.cfg
#ln -s /vagrant/hokuto/etc/init.d/hokuto /etc/init.d/hokuto
#update-rc.d hokuto defaults

# Create symbolic links for Nanto
rm -rf /usr/local/nanto
ln -s /vagrant/nanto/src /usr/local/nanto
rm /etc/nanto.cfg
cp /vagrant/nanto/etc/nanto.cfg /etc/nanto.cfg
#ln -s /vagrant/nanto/etc/init.d/nanto /etc/init.d/nanto
#update-rc.d nanto defaults

# Make the lib folder available globally for the shinken and vagrant users
#mkdir -p /home/shinken/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/shinken/.local/lib/python2.7/site-packages/on_reader
#chown -R shinken:shinken /home/shinken

#mkdir -p /home/vagrant/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/vagrant/.local/lib/python2.7/site-packages/on_reader
#chown -R vagrant:vagrant /home/vagrant/.local

#
# Start things up
service shinken restart
service hokuto start
service nanto start