#!/usr/bin/env bash

export DEBIAN_FRONTEND=noninteractive
export PERL_MM_USE_DEFAULT=true

# Add the official R repository to get R 3.0 (wheezy only has 2.x)
sed -i '$ a\deb http://cran.univ-lyon1.fr/bin/linux/debian wheezy-cran3/' /etc/apt/sources.list
apt-key adv --keyserver keys.gnupg.net --recv-key 381BA480

aptitude -q update
aptitude -y -q full-upgrade
aptitude -y -q install vim python-pip python-dev snmpd curl libcurl4-openssl-dev nagios-plugins unzip byacc flex automake libtool libxml2-dev python-rrd

# Configure snmpd
cp /vagrant/vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
service snmpd restart

# Configure PERL for the SNMP probes
cpan install Net::SNMP

useradd --user-group shinken
useradd --user-group graphite
pip install pycurl cherrypy shinken==2.0.3

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
# We do not use the "install" target as it will  install the on-reader lib by copying the files
# Instead we'll create links to directly manipulate the files during development
cd /vagrant
make dependencies sudoer graphite shinken clean

# Auto start the carbon daemon on launch
cp /vagrant/vagrant_provision/carbon.init.template /etc/init.d/carbon
chmod 755 /etc/init.d/carbon
update-rc.d carbon defaults

# Make the lib folder available globally for the shinken and vagrant users
mkdir -p /home/shinken/.local/lib/python2.7/site-packages
ln -s /vagrant/lib/on_reader/on_reader /home/shinken/.local/lib/python2.7/site-packages/on_reader
chown -R shinken:shinken /home/shinken

mkdir -p /home/vagrant/.local/lib/python2.7/site-packages
ln -s /vagrant/lib/on_reader/on_reader /home/vagrant/.local/lib/python2.7/site-packages/on_reader
chown -R vagrant:vagrant /home/vagrant/.local

# Create links so that the shinken module is in the right place
ln -s /vagrant/hokuto/module /var/lib/shinken/modules/hokuto
ln -s /vagrant/hokuto/etc/modules/hokuto.cfg /etc/shinken/modules/hokuto.cfg

#
# Start things up
/etc/init.d/carbon start
service shinken restart
