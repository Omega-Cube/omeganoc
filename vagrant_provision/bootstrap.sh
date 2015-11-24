#!/usr/bin/env bash

export DEBIAN_FRONTEND=noninteractive
export PERL_MM_USE_DEFAULT=true

#Configure the source.list
cp /vagrant/vagrant_provision/source.list.template /etc/apt/sources.list 

aptitude -q update
aptitude -y -q full-upgrade
aptitude -y -q install vim git python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev
aptitude -y -q install snmpd snmp snmp-mibs-downloader
apt-get  -y -o APT::Install-Recommends=0 install nagios-nrpe-plugin nagios-plugins nagios-plugins-basic nagios-plugins-standard nagios-plugins-contrib nagios-snmp-plugins
aptitude -y -q install openntpd
chmod u+s /usr/lib/nagios/plugins/check_icmp
#download-mibs

pip install requests

# Configure ntp
cp /vagrant/vagrant_provision/ntpd.conf.template /etc/openntpd/ntpd.conf

# Configure snmpd
cp /vagrant/vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
sed -i 's/mibs/#mibs/' /etc/snmp/snmp.conf
service snmpd restart

# Configure PERL for the SNMP probes
cpan install Net::SNMP

useradd --user-group shinken
useradd --user-group graphite
pip install pycurl cherrypy nagiosplugin noise
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
#cp /vagrant/vagrant_provision/broker-master.cfg.template /etc/shinken/brokers/broker-master.cfg
#cp /vagrant/vagrant_provision/livestatus.cfg.template /etc/shinken/modules/livestatus.cfg
rsync -avlp /vagrant/vagrant_provision/shinken/ /etc/shinken/

# Launch the installer
# We do not use the "install" target because we we to create symlinks to the development files
# instead of copies to facilitate development.
make graphite shinken on-reader clean

# Create symbolic links for Hokuto
ln -s /vagrant/hokuto/standalone /usr/local/hokuto
ln -s /vagrant/hokuto/etc/hokuto.cfg /etc/hokuto.cfg
ln -s /vagrant/hokuto/etc/init.d/hokuto /etc/init.d/hokuto
update-rc.d hokuto defaults

# Auto start the carbon daemon on launch
cp /vagrant/vagrant_provision/carbon.init.template /etc/init.d/carbon
chmod 755 /etc/init.d/carbon
update-rc.d carbon defaults

# with symbolic links hokuto and on_reader are not readable from shinken services which prevent shinken from loading hokuto.

# Make the lib folder available globally for the shinken and vagrant users
#mkdir -p /home/shinken/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/shinken/.local/lib/python2.7/site-packages/on_reader
#chown -R shinken:shinken /home/shinken

#mkdir -p /home/vagrant/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/vagrant/.local/lib/python2.7/site-packages/on_reader
#chown -R vagrant:vagrant /home/vagrant/.local

#
# Start things up
#/etc/init.d/carbon start
service shinken restart
service snmpd restart
service openntpd restart
service hokuto start
