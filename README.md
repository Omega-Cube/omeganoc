INSTALL
=======

Dependencies:
------------
* shinken >= 2.0
* sqlite3
* graphviz
* graphviz-devel
* python >= 2.6
* python-devel
* libxml2-devel

There is currently an installer for three OS : CentOS (7+), Debian and Ubuntu.
If you are runing one of this you can directly run one of this command :

    make debian
    make ubuntu
    make centos

This installers have been tested on : Centos 7.0, Debian 8.1 and Ubuntu 14.04.
And move directly to STEP 5.
Note: if you are installing from the git repository you still have to do the submodule step (0) before.

STEP 0 : FETCH GIT SUBMODULES
-----------------------------

If you are installing or upgrading from the git repository you'll need to fetch
external modules before running any commands.

    git submodule init
    git submodule update

STEP 1 : SHINKEN INSTALL
------------------------

Install and initialize shinken (requiere root privileges).

     useradd --user-group shinken
     cd <omeganoc>/<directory>
     make shinken-install
     shinken --init
Just run `make shinken-install` if shinken have already ben installed.

STEP 2 : INSTALL SHINKEN PLUGINS
--------------------------------

Run the install script with root privileges

    cd <omeganoc>/<directory>
    make install

Edit broker-master.cfg to add hokuto, graphite and livestatus modules

    #/etc/shinken/brokers/broker-master.cfg
    modules    graphite, livestatus, hokuto

Also, if you have a lot of livestatus logs data, you can get better performance by enabling aggressive_sql mode
logstore-sqlite:

     #/etc/shinken/modules/logstore_sqlite.cfg
     use_aggressive_sql      1   ; Set to 1 for large installations

STEP 3 : IMPORTING PREVIOUS DATA
--------------------------------

You can skip this step if it is your first install.
You'll need to initialize the sla database with existing archived logs

    make import-sla

STEP 4 : START/RESTART DAEMONS
---------------------------------

In order to work correctly Omega Noc needs three daemons running:
* Shinken, collect metrics and monitoring data
* Carbon, receive and store metrics returned by Shinken
* Hokuto, the web interface

To start Carbon:

    python /opt/graphite/bin/carbon-cache.py start

Note: It can be helpful to add an init script into your boot loader, as
forgetting to start carbon is a common mistake.

If you are on Debian or probably any init based OS, you can use the provided startup script for Hokuto.
Run this from the installation directory to install it:

    cp hokuto/etc/init.d/hokuto /etc/init.d/hokuto
    update-rc.d hokuto defaults

Or if your are using systemd you can try our script :
   cp hokuto/etc/systemd/system/hokuto.service /etc/systemd/system/hokuto.service
   systemctl enable hokuto.service

After the install Shinken, Carbon and Hokuto needs to be (re)started:

    /etc/init.d/shinken [re]start
If you have installed the debian start script :
    /etc/init.d/hokuto [re]start
Eitherway on others distribution you have to launch the gunicorn daemon manually :
    /usr/local/hokuto/gunicorn_launcher.py

You also have to restart the cron daemon :
    /etc/init.d/cron restart
    #or
    crond restart

After the first launch some files have the wrong permission settings, you have to run some chown to made hokuto fully functional:
     chown shinken:shinken /var/lib/shinken/hokuto.db
     chown -R shinken:shinken /tmp/shinken

STEP 5 : CONFIGURE
------------------

To change settings, like address and port for omeganoc interface, edit the file /etc/hokuto.cfg.

Don't forget to restart the service after any change:

      /etc/init.d/hokuto restart
      #or
      systemctl restart hokuto.service

You now should be able to load the interface from the address and port defined in hokuto.cfg : http://<host>:<port>

STEP 6 : SET ADMIN USER PASSWORD
--------------------------------

At this stage you should be able to access Omega Noc at http://<host>:<port>
(or whatever address / port you configured in step 4).
Omega Noc default user credentials are:

         username : admin
         password : admin

Don't forget to login and change this for a more secure password.

ADDING NEW HOSTS, CONTACTS AND SERVICES
=======================================

From the interface go to Manage Omeganoc -> Manage shinken , this tool is still under development but you should be able to define basic host/contact/services from here.
To prevent any conflict on config file, when someone edit some file he will lock the whole configuration until he decide to apply or cancel his changes.

For more informations about shinken setings see [shinken settings and configuration](https://shinken.readthedocs.org/en/latest/05_thebasics/index.html).

TROUBLESHOOTING
===============

### I can't see any host/probe

By default all users are created with the shinken contact 'None', which
prevents the user to get information from any host. This is because a user can
only see the elements that has been assigned to his/her Shinken contact.

To fix that problem, edit your profile to use an appropriate shinken contact
(or ask an admin to do it for you). Shinken contacts are imported from shinken,
for more information see [Shinken contact configuration](https://shinken.readthedocs.org/en/latest/08_configobjects/contact.html).

Another reason can be that carbon daemon is not running, which prevents Shinken
from sending data to the metrics database (see *STEP 5: Start or restart daemons*
in the installation procedure above).

### SLA tools don't take events prior to my installation into acount

Retrieving SLA informations from livestatus was very ressource consuming, so
OmegaNoc use his own database to process such data.

To import all data from archived livestatus logs (collected if you use Shinken
without OmegaNoc before), you can import your existing data by running
that command from the installation folder:

    make import-sla

### Dashboard's widget are very slow to load / the spinner never goe away

This may be caused by performance issues with Livestatus. Try enabling
use_aggressive_sql in logstore-sqlite's configuration.

### I just installed shinken but the default configuration seems wrong / I do not any data

Shinken is provided with a prebuild config which monitors localhost. If you
want to use it, you'll have to install the Nagios standard plugins (you can
usually find with with the name nagios-plugins in package managers).

Don't forget to check if carbon is currently running!

Last thing is that the hosts and services won't show up in the dashboards until
Shinken have sent their first batch of data. This can take a few minutes, make sure
Shinken is running and wait 5 or 10 minutes for the data to flow in.
