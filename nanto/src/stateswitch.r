# INPUT VARIABLES:
# - LOS: sequence of state idendifiers (0 for OK, 1 for Warning, 2 for Critical, 3 for Error)

# OUTPUT VARIABLES:
# - FR: Checksum. Sequence of numbers. All values should be 1 if the computations went all good
# - F: A matrix containing estimated times to reach the ERROR state from other states
# - TM: The transition matrix. Note that the ERROR state is absorbing (in order to avoid unreasonable processing times)
# - M: A sequence containing all the missing states 

# A container for missing states
M = c()

# We received states on range 0-3 but we want to work on range 1-4
LOS = LOS + 1

# Create a fake error if there is none
# (the rest will crash if there is no error)
if (length(which(LOS == 4)) == 0) {
    LOS = append(LOS, 4)
}

# Lists for every state
OkState = rep(0, 4)
WState = rep(0, 4)
CState = rep(0, 4)
EState = rep(0,4)

for(i in 1:(length(LOS)-1)){
    if (LOS[i] == 1){
        if (LOS[i+1] == 1){
            OkState[1] = OkState[1] + 1
        }
        if (LOS[i+1] == 2){
            OkState[2] = OkState[2] + 1
        }
        if (LOS[i+1] == 3){
            OkState[3] = OkState[3] + 1
        }
        if (LOS[i+1] == 4){
            OkState[4] = OkState[4] + 1
        }
    }
    
    if (LOS[i] == 2){
        if (LOS[i+1] == 1){
            WState[1] = WState[1] + 1
        }
        if (LOS[i+1] == 2){
            WState[2] = WState[2] + 1
        }
        if (LOS[i+1] == 3){
            WState[3] = WState[3] + 1
        }
        if (LOS[i+1] == 4){
            WState[4] = WState[4] + 1
        }
    }
    
    if (LOS[i] == 3){
        if (LOS[i+1] == 1){
            CState[1] = CState[1] + 1
        }
        if (LOS[i+1] == 2){
            CState[2] = CState[2] + 1
        }
        if (LOS[i+1] == 3){
            CState[3] = CState[3] + 1
        }
        if (LOS[i+1] == 4){
            CState[4] = CState[4] + 1
        }
    }
}

# If there is some list of states missing - isolate them from the chain
if (all(OkState == c(0, 0, 0, 0)) == TRUE){
    OkState = c(1, 0, 0, 0)
    M = c(M, 1)
}
if (all(WState == c(0, 0, 0, 0)) == TRUE){
    WState = c(0, 1, 0, 0)
    M = c(M, 2)
}
if (all(CState == c(0, 0, 0, 0)) == TRUE) {
    CState = c(0, 0, 1, 0)
    M = c(M, 3)
}

# Making probability 
okProb = OkState / sum(OkState)
wProb = WState / sum(WState)
cProb = CState / sum(CState)
eProb = c(0, 0, 0, 1)

# The transition matrix
TM = matrix(0, nrow=4, ncol=4)
TM[1,] = okProb
TM[2,] = wProb
TM[3,] = cProb
TM[4,] = eProb

# Get the Q matrix
Q = TM[c(1,2,3),c(1,2,3)]

# Replace zeros with very small value 0.0000001 (avoiding division by zero later)
test_list = c(0, 0, 0)
for (i in 1:length(Q[1,])){
    test_list[i] = 1
    if (all(Q[i,] == test_list) == TRUE){
        for (j in 1:length(Q[i,])){
            if (i == j){
                Q[i, j] = 0.9999998
            }
            else{
                Q[i, j] = 0.0000001
            }
        }
    }
    test_list = c(0, 0, 0)
}

# Get the R matrix
R = TM[c(1,2,3), c(4)]

# set the I matrix
I = matrix(c(1, 0, 0, 0, 1, 0, 0, 0, 1), ncol=3)   
  
# F = transposed (I - Q)
F = solve(I - Q)

# get the FR matrix
FR = F %*% R
