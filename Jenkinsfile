// Runs a script inside a throwaway container. Source is streamed in with tar,
// so no host bind mounts are needed (the agent itself runs in a container).
def inDocker(String image, String script) {
    writeFile file: '.ci-step.sh', text: "set -eux\n" + script + "\n"
    sh """
        set -eu
        tar --exclude=./.git -cf - . | docker run --rm -i --memory 6g --cpus 4 \\
          -e CI=true -e HOME=/tmp/home ${image} \\
          sh -c 'mkdir -p /src /tmp/home && cd /src && tar -xf - && sh .ci-step.sh'
    """
}

pipeline {
    agent { label 'linux-docker' }
    options { timeout(time: 20, unit: 'MINUTES'); timestamps(); disableConcurrentBuilds(); buildDiscarder(logRotator(numToKeepStr: '20')) }
    stages {
        stage('Node 20: install, check, audit') {
            steps { script { inDocker('node:20', 'npm ci\nnpm run check\nnpm audit --omit=dev') } }
        }
    }
    post { always { deleteDir() } }
}
