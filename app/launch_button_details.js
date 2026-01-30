document.addEventListener('DOMContentLoaded', () => {
    const launchButton = document.getElementById('launch_button');
    const launchProgressLabel = document.getElementById('launch_progress_label');
    const launchDetails = document.getElementById('launch_details');
    let observer = null;
    let currentPercentage = 0;

    function updateLaunchButtonText() {
        launchButton.textContent = launchProgressLabel.textContent;
    }

    function updateButtonBackgroundColor() {
        const completedColor = '#7fc734'; // Cor completa do botão
        const whitecolor = "#fff"; // Cor do texto
        
        launchButton.style.transition = 'background-color 0.5s ease';
        launchButton.style.background = completedColor; // Cor fixa
        launchButton.style.color = whitecolor;
        launchButton.style.borderRadius = '5px';
    }

    function animatePercentageChange(newPercentage) {
        const duration = 2500; // Duração total da animação em milissegundos
        const frameRate = 10; // Tempo em milissegundos para atualizar a animação
        const totalSteps = duration / frameRate;
        const stepSize = (newPercentage - currentPercentage) / totalSteps;

        let stepCount = 0;
        function animate() {
            if (stepCount < totalSteps) {
                currentPercentage += stepSize;
                // Atualização da cor removida, pois agora é fixa
                stepCount++;
                setTimeout(animate, frameRate);
            } else {
                currentPercentage = newPercentage; 
                // Atualização da cor removida, pois agora é fixa
            }
        }
        animate();
    }

    function observeProgressChanges() {
        observer = new MutationObserver(() => {
            const labelText = launchProgressLabel.textContent.trim();
            const newPercentage = parseInt(labelText);

            if (!isNaN(newPercentage) && newPercentage >= 0 && newPercentage <= 100) {
                updateLaunchButtonText();
                if (newPercentage !== currentPercentage) {
                    animatePercentageChange(newPercentage);
                }
            }
        });
        observer.observe(launchProgressLabel, { childList: true, characterData: true, subtree: true });
    }

    launchButton.addEventListener('click', () => {
        launchDetails.style.display = 'block';
        observeProgressChanges();
        updateLaunchButtonText();
        updateButtonBackgroundColor(); // Chama a função sem passar a porcentagem
    });
});
