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

*For Debian/Ubuntu*

    apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev
*For CentOS 7+*

    # install setup tools
    curl https://bitbucket.org/pypa/setuptools/raw/bootstrap/ez_setup.py | python -
    # install pip
    curl https://raw.github.com/pypa/pip/master/contrib/get-pip.py | python -
    easy_install pip

    yum install sqlite graphviz graphviz-devel gcc gcc-c++ python-devel libxml2-devel

STEP 0 : FETCH GIT SUBMODULES
-----------------------------

If you are installing or upgrading from the git repository you'll need to fetch 
external modules before running any commands.

    git submodules init
    git submodules update

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
    
Also, if you have a lot of livestatus logs data (this typically happens when 
you monitoring system has been running for a long time, or with a high amount
of monitored elements), you can get better performance by configuring 
logstore-sqlite:

     #/etc/shinken/modules/logstore_sqlite.cfg
     use_aggressive_sql      1   ; Set to 1 for large installations

STEP 3 : IMPORTING PREVIOUS DATA
--------------------------------

You can skip this step if it is your first install.
You'll need to initialize the sla database with existing archived logs

    make import-sla

STEP 4 : CONFIGURE
------------------

To change settings update /etc/shinken/modules/hokuto.cfg :
```
## Module:      Omega Noc
## Loaded by:   Broker
# The Omeganoc web interface and integrated web server
define module {
    module_name     hokuto
    module_type     hokuto
    host            0.0.0.0;                       The hostname to listen on. 0.0.0.0 to listen from any sources.
    port            5000;                          The port of the webserver.
    dbpath          /var/lib/shinken/hokuto.db;    The path the OmegaNoc's database file
    secretkey       Enter the secretest key here!; The server's secret key used for signing cookies
    logging         /var/log/shinken/hokuto.log;   Log file
    threaded        1  ;                           Set to 0 if you want to manage all requests on the same thread. Slower but may
                       ;                           improve stability in some cases
}
```
Don't forget to restart the service after any change:

      /etc/init.d/shinken restart

You can then access hokuto from http://<host>:<port>

STEP 5 : START OR RESTART DAEMONS
---------------------------------

In order to work correctly Omega Noc needs three daemons running:
* Shinken, to collect monitoring data
* Carbon, to receive and store metrics measured by Shinken
* Hokuto, the website that will show all that data to you

So after install, Shinken needs to be (re)started:

    service shinken [re]start
    
You'll also need to start Carbon:

    python /opt/graphite/bin/carbon-cache.py start
    
Note: It can be helpful to add an init script into your boot loader, as 
forgetting to start carbon is a common mistake.

Also, if you are on Debian, you can use the provided startup script for Hokuto.
Run this from the installation directory to install it:

    cp hokuto/etc/init.d/hokuto /etc/init.d/hokuto
    update-rc.d hokuto defaults



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

An admin interface to manage hosts/services/contacts and probes is currently 
under development.

For now if you need to add or edit hosts, services, contacts and monitoring 
data see [shinken settings and configuration](https://shinken.readthedocs.org/en/latest/05_thebasics/index.html).

TROUBLESHOOTING
===============

* I can't see any host/probe

By default all users are created with the shinken contact 'None', which 
prevents the user to get information from any host. This is because a user can
only see the elements that has been assigned to his/her Shinken contact.

To fix that problem, edit your profile to use an appropriate shinken contact 
(or ask an admin to do it for you). Shinken contacts are imported from shinken,
for more information see [Shinken contact configuration](https://shinken.readthedocs.org/en/latest/08_configobjects/contact.html).

Another reason can be that carbon daemon is not running, which prevents Shinken
from sending data to the metrics database (see *STEP 5: Start or restart daemons*
in the installation procedure above).

* SLA tools don't use events prior to my installation

Retrieving SLA informations from livestatus was very ressource consuming, so 
Omega Noc uses its own database to process such data.

To import all data from archived livestatus logs (collected if you use Shinken
without Omega Noc before), you can import your existing data into Omega Noc's 
database. To do this, run that command from the installation folder:

    make import-sla
     
* Dashboard's widget are very slow to load / the spinner thingy in them never goes away

This may be cause by performance problems in Livestatus. Try enabling 
use_aggressive_sql in logstore-sqlite's configuration.

* I just installed shinken but the default configuration seems wrong / I do not any data

Shinken is provided with a prebuild config which monitors localhost. If you 
want to use it, you'll have to install the Nagios standard plugins (you can
usually find with with the name nagios-plugins in package managers).

Don't forget to check if carbon is currently running!

Last thing is that the hosts and services won't show up in the dashboards until
Shinken sent their first batch of data. This can take a few minutes, make sure
Shinken is running and wait 5 or 10 minutes for the data to flow in! 
