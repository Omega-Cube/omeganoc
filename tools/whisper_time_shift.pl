#!/usr/bin/env perl

use strict;
use warnings;

use Data::Dumper;

my $WORKINGDIR = shift || '/opt/graphite/storage/whisper';

my $TIME = shift || 4 * 30 * 24 * 3600;

#list files
opendir(my $hosts,$WORKINGDIR) or die $!;

while(my $host = readdir($hosts)){
    next if($host eq '.' or $host eq '..');
    
    opendir(my $services, $WORKINGDIR.'/'.$host);
    while(my $service = readdir($services)){
        next if($service eq '.' or $service eq '..');
        my $dir = $WORKINGDIR.'/'.$host.'/'.$service;
        opendir(my $probes, $WORKINGDIR.'/'.$host.'/'.$service);
        while(my $probe = readdir($probes)){
            next if($probe eq '.' or $probe eq '..');
            if(($probe =~ /\.tmp$/)){
                unlink $dir.'/'.$probe;
                next;
            }
            if(($probe =~ /\.bck$/)){
                unlink $dir.'/'.$probe;
                next;
            }

            my $origfile = $dir.'/'.$probe;
            my $tmpfile = $origfile.'.tmp';
            print "$origfile\n";
            
            #get aggregation info
            open(my $infos, "whisper-info.py $origfile |");
            my @archives = ();
            my $aoffset = 0;
            while(my $i = <$infos>){
                if($i =~ /^Archive/){
                    $aoffset = push(@archives, {});
                    $aoffset--;
                }
                if($i =~ /^secondsPerPoint/){
                    ($archives[$aoffset]{'spp'}) = ($i =~ /^secondsPerPoint:\s(\d+)/);
                }
                if($i =~ /^points:/){
                    ($archives[$aoffset]{'size'}) = ($i =~ /^points:\s(\d+)/);
                }
            }

            my $fullspp = $archives[$aoffset]{'spp'};
            my $fullsize = $archives[$aoffset]{'size'};
            my $start = time() - $fullspp * $fullsize;
            my $end = time() - $TIME;

            #update all entries from tmp with timeshift
            open(my $fetch, "whisper-fetch.py --from $start --until $end $origfile |");
            my $updatestring = "";
            while(my $data = <$fetch>){
                my ($date,$value) = ($data =~ /(\d+)\s+([\w\d\.]+)/);
                $date += $TIME;
                last if $date > time();
                next unless $value;
                next if($value eq 'None');
                $updatestring.= " ".$date.':'.$value;
            }
            next unless $updatestring;
            print qx{whisper-update.py $origfile $updatestring};

            #rince and repeat
        }
    }
}
