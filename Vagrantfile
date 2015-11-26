# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.box = "bento/debian-8.2"

  config.vm.network "private_network", ip: "192.168.33.101"

  config.vm.provision :shell, :path => "vagrant_provision/bootstrap.sh"

  # Configure VM Ram usage
  config.vm.provider :virtualbox do |vb|
    vb.cpus = 4
    vb.memory = 2048
  end

end
