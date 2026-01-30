fetch('https://api.npoint.io/b959cc4e81171469fe21')
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro ao carregar os dados');
        }
        return response.json();
    })
    .then(data => {
        const erroElement = document.getElementById('erroMensagem');

        if (!data.hasOwnProperty('fotoNoticia')) {
            throw new Error('Campo "fotoNoticia" não encontrado no JSON');
        }

        const tituloElement = document.getElementById('tituloNoticia');
        const descricaoElement = document.getElementById('descricaoNoticia');
        const linkElement = document.getElementById('linkNoticia');
        const leftDivElement = document.getElementById('right');

        if (!tituloElement || !descricaoElement || !linkElement || !leftDivElement) {
            throw new Error('Elementos HTML não encontrados');
        }

        tituloElement.innerText = data.tituloNoticia;
        descricaoElement.innerText = data.descricaoNoticia;
        linkElement.href = data.linkNoticia; // Atualiza o href do link com o linkNoticia do JSON
        leftDivElement.style.backgroundImage = `url(${data.fotoNoticia})`;
        leftDivElement.style.backgroundSize = 'auto';
        leftDivElement.style.backgroundPosition = 'center';
        leftDivElement.style.backgroundRepeat = 'no-repeat';
        
        


            })
    .catch(error => {
        const erroElement = document.getElementById('erroMensagem');
        if (erroElement) {
            erroElement.innerText = `Erro ao carregar os dados: ${error.message}`;
        }
    });


    document.addEventListener('DOMContentLoaded', function() {
        const leftDiv = document.getElementById('InfoNotices');
    
        leftDiv.addEventListener('click', function() {
            // Obtém o elemento de link
            const linkElement = document.getElementById('linkNoticia');
    
            if (linkElement && linkElement.href) {
                shell.openExternal(linkElement.href);
            } else {
                shell.openExternal('https://www.google.com');
            }
        });
    });

