let columnCount = 0;
let csvData = [];
let namesData = null;
let isCSVLoaded = false;
let columnMetadata = {};
let uploadedData = null;
let loadedColumns = [];
let loadedData = [];
let model;
const store_name = 'csvDataStore';

// Загрузка данных имен
fetch("names.json")
    .then((response) => {
        if (!response.ok) {
            throw new Error("Нет ответа сети " + response.statusText);
        }
        return response.json();
    })
    .then((data) => {
        namesData = data;
    })
    .catch((error) => console.error("Ошибка загрузки данных имен:", error));

/**
 * Открывает базу данных IndexedDB.
 * @returns {Promise<IDBDatabase>} - Возвращает промис, который разрешается в базу данных.
 */
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('csvDatabase', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(store_name)) {
                db.createObjectStore(store_name, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Сохраняет данные в IndexedDB.
 * @param {string} csvContentIndexedDB - CSV данные для сохранения.
 * @returns {Promise<void>} - Возвращает промис, который разрешается при успешном сохранении.
 */
async function saveModelToIndexedDB(csvContentIndexedDB) {
    const db = await openDatabase();
    const transaction = db.transaction(store_name, 'readwrite');
    const store = transaction.objectStore(store_name);
    const request = store.put({ id: 'csvData', content: csvContentIndexedDB });
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Сохраняет данные в IndexedDB, разбивая их на части.
 * @param {string} csvContent - CSV данные для сохранения.
 */
async function saveModelToIndexedDBInParts(csvContent) {
  const chunkSize = 1 * 1024 * 1024; // 1 MB
  const chunks = [];

  for (let i = 0; i < csvContent.length; i += chunkSize) {
    chunks.push(csvContent.slice(i, i + chunkSize));
  }

  const db = await openDatabase();
  const transaction = db.transaction(store_name, "readwrite");
  const store = transaction.objectStore(store_name);

  for (let i = 0; i < chunks.length; i++) {
    await new Promise((resolve, reject) => {
      const request = store.put({ id: i, data: chunks[i] });
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = reject;
  });
}

/**
 * Загружает данные из IndexedDB.
 * @returns {Promise<string|null>} - Возвращает промис, который разрешается в загруженные данные или null, если данные не найдены.
 */
async function loadModelFromIndexedDB() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(store_name, "readonly");
    const store = transaction.objectStore(store_name);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result && request.result.length > 0) {
          // Объединяем части данных из IndexedDB
          const csvContent = request.result
            .sort((a, b) => a.id - b.id)
            .map((item) => item.data)
            .filter((data) => typeof data === "string") // Фильтруем только строки
            .join("");
          console.log("Загруженные данные из IndexedDB:", csvContent);
          resolve(csvContent);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Ошибка загрузки данных из IndexedDB:", error);
    return null;
  }
}

/**
 * Очищает базу данных IndexedDB и удаляет её.
 * @returns {Promise<void>} - Возвращает промис, который разрешается после успешной очистки и удаления базы данных.
 */
async function clearIndexedDB() {
    const dbName = 'csvDatabase';
    // Открыть базу данных
    const db = await openDatabase();
    // Очистить хранилище объектов
    const transaction = db.transaction(store_name, 'readwrite');
    const store = transaction.objectStore(store_name);
    const clearRequest = store.clear();

    await new Promise((resolve, reject) => {
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Закрыть соединение с базой данных
    db.close();

    // Удалить базу данных
    const deleteRequest = indexedDB.deleteDatabase(dbName);

    deleteRequest.onsuccess = () => {
        console.log('База данных успешно удалена');
    };

    deleteRequest.onerror = () => {
        console.error('Ошибка при удалении базы данных:', deleteRequest.error);
    };

    deleteRequest.onblocked = () => {
        console.warn('Операция удаления заблокирована. Повторная попытка через 1 секунду...');
        setTimeout(() => {
            indexedDB.deleteDatabase(dbName);
        }, 1000);
    };
}

/**
 * Добавляет новый столбец в форму.
 * @param {string} columnName - Название столбца.
 * @param {string} dataType - Тип данных.
 * @param {string} dataRange - Диапазон данных.
 */
function addColumn(columnName = "", dataType = "", dataRange = "") {
    columnCount++;
    const newColumn = document.createElement("div");
    newColumn.className = "column";
    newColumn.innerHTML = `
<div class="column-row">
    <div class='row_number'>${columnCount}</div>
    <input type="text" id="column_name_${columnCount}" name="column_names" placeholder="Название столбца ${columnCount}" value="${columnName}" required title="Введите название столбца">
    <select id="data_type_${columnCount}" name="data_type_column_name_${columnCount}" required title="Выберите тип данных">
        <option value="" disabled ${dataType ? "" : "selected"}>Тип данных</option>
        <option value="date" ${dataType === "date" ? "selected" : ""}>date</option>
        <option value="time" ${dataType === "time" ? "selected" : ""}>time</option>
        <option value="float_range" ${dataType === "float_range" ? "selected" : ""}>float_range</option>
        <option value="integer_range" ${dataType === "integer_range" ? "selected" : ""}>integer_range</option>
        <option value="range_negative" ${dataType === "range_negative" ? "selected" : ""}>range_negative</option>
        <option value="choice" ${dataType === "choice" ? "selected" : ""}>choice</option>
        <option value="boolean" ${dataType === "boolean" ? "selected" : ""}>boolean</option>
        <option value="name" ${dataType === "name" ? "selected" : ""}>name</option>
        <option value="phone" ${dataType === "phone" ? "selected" : ""}>phone</option>
        <option value="email" ${dataType === "email" ? "selected" : ""}>email</option>
        <option value="random" ${dataType === "random" ? "selected" : ""}>random</option>
        ${!isCSVLoaded ? `<option value="fromloadcsv" ${dataType === "fromloadcsv" ? "selected" : ""}>fromloadcsv</option>` : ''}
    </select>
    <button type="button" class="row_remove" onclick="removeColumn(${columnCount})" title="Удалить столбец">X</button>
    <textarea id="data_range_${columnCount}" class="range" name="data_range_column_name_${columnCount}" placeholder="Диапазон" title="Введите диапазон данных">${dataRange}</textarea>
</div>
`;
    document.getElementById("columns").appendChild(newColumn);
    updateDataRangeVisibility(columnCount);
    styleSelect(columnCount);
    adjustTextareaHeight(columnCount);
    document.getElementById(`data_type_${columnCount}`).addEventListener("change", function () {
        const dataType = this.value;
        const dataRangeInput = document.getElementById(`data_range_${columnCount}`);

        switch (dataType) {
            case "date":
                dataRangeInput.placeholder = "ДД.ММ.ГГГГ-ДД.ММ.ГГГГ";
                break;
            case "time":
                dataRangeInput.placeholder = "ЧЧ:ММ:СС-ЧЧ:ММ:СС";
                break;
            case "float_range":
            case "integer_range":
                dataRangeInput.placeholder = "От-до (например, 1-10)";
                break;
            case "range_negative":
                dataRangeInput.placeholder = "От, до (например, -10, 5 или -1.56, 0)";
                break;
            case "choice":
                dataRangeInput.placeholder = "Значение1, Значение2, Значение3 и т.д.";
                break;
            default:
                dataRangeInput.placeholder = "";
        }
    });

    const dataTypeSelect = document.getElementById(`data_type_${columnCount}`);
    if (dataTypeSelect) {
        updateDataRangeVisibility(columnCount);
    }
}

/**
 * Удаляет столбец из формы.
 * @param {number} columnIndex - Индекс столбца.
 */
function removeColumn(columnIndex) {
    const column = document.getElementById(`column_name_${columnIndex}`).parentElement.parentElement;
    column.remove();
    columnCount--;
    renumberColumns();
}

/**
 * Перенумеровывает столбцы после удаления.
 */
function renumberColumns() {
    const columns = document.querySelectorAll(".column-row");
    columns.forEach((column, index) => {
        const columnNameInput = column.querySelector('input[name="column_names"]');
        const dataTypeSelect = column.querySelector('select[name^="data_type_column_name_"]');
        const dataRangeTextarea = column.querySelector('textarea[name^="data_range_column_name_"]');
        const rowNumber = column.querySelector(".row_number");

        if (columnNameInput && dataTypeSelect && dataRangeTextarea && rowNumber) {
            columnNameInput.id = `column_name_${index + 1}`;
            columnNameInput.placeholder = `Название столбца ${index + 1}`;
            dataTypeSelect.id = `data_type_${index + 1}`;
            dataTypeSelect.name = `data_type_column_name_${index + 1}`;
            dataRangeTextarea.id = `data_range_${index + 1}`;
            dataRangeTextarea.name = `data_range_column_name_${index + 1}`;
            rowNumber.textContent = index + 1;

            const removeButton = column.querySelector(".row_remove");
            removeButton.onclick = function () {
                removeColumn(index + 1);
            };
        } else {
            console.error(`Один или несколько элементов не найдены для колонки ${index + 1}`);
        }
    });
}

/**
 * Обновляет видимость поля ввода диапазона данных в зависимости от типа данных.
 * @param {number} columnNumber - Номер столбца.
 */
function updateDataRangeVisibility(columnNumber) {
    const dataTypeSelect = document.getElementById(`data_type_${columnNumber}`);
    const dataRangeTextarea = document.getElementById(`data_range_${columnNumber}`);

    if (dataTypeSelect && dataRangeTextarea) {
        dataTypeSelect.addEventListener("change", function () {
            if (dataTypeSelect.value === "float_range" || dataTypeSelect.value === "date" || dataTypeSelect.value === "integer_range" || dataTypeSelect.value === "range_negative" || dataTypeSelect.value === "choice" || dataTypeSelect.value === "time") {
                dataRangeTextarea.style.display = "block";
            } else {
                dataRangeTextarea.style.display = "none";
            }
        });
    }
}

/**
 * Обновляет стиль выбора типа данных.
 * @param {number} columnNumber - Номер столбца.
 */
function styleSelect(columnNumber) {
    const dataTypeSelect = document.getElementById(`data_type_${columnNumber}`);
    dataTypeSelect.addEventListener("change", function () {
        if (dataTypeSelect.value === "") {
            dataTypeSelect.style.color = "darkgray";
        } else {
            dataTypeSelect.style.color = "black";
        }
    });

    if (dataTypeSelect.value === "") {
        dataTypeSelect.style.color = "darkgray";
    } else {
        dataTypeSelect.style.color = "black";
    }
}

/**
 * Регулирует высоту текстового поля в зависимости от введенного текста.
 * @param {number} columnNumber - Номер столбца.
 */
function adjustTextareaHeight(columnNumber) {
    const textarea = document.getElementById(`data_range_${columnNumber}`);
    textarea.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });
}

/**
 * Экранирует специальные символы в строке для CSV.
 * @param {string} value - Значение для экранирования.
 * @returns {string} - Экранированное значение.
 */
function escapeCSV(value) {
    if (typeof value === 'string') {
        value = value.replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value}"`;
        }
    }
    return value;
}

/**
 * Генерирует CSV данные на основе введенных параметров.
 */
/**
 * Генерирует CSV данные на основе введенных параметров.
 */
async function generateCSV() {
    if (uploadedData) {
      // Если файл был загружен, используем его данные и добавляем новые столбцы
      const csvData = generateCSVDataWithLoadedData();
      displayCSVData(csvData);
    } else {
      if (!checkAndPrompt()) {
        return;
      }
      const processMessage = document.getElementById("processMessage");
      const messageBox = processMessage.querySelector(".message-box");
  
      // Устанавливаем текст сообщения
      messageBox.textContent = "Создаем данные... Пожалуйста, подождите.";
  
      // Отображаем контейнер
      processMessage.style.display = "flex";
  
      const numRows = parseInt(document.getElementById("num_rows").value, 10);
      const filename = document.getElementById("filename").value + ".csv";
      const indexType = document.getElementById("indexType").value;
      let indexes;
  
      if (indexType === "auto") {
        indexes = Array.from({ length: numRows }, (_, i) => i + 1);
      } else if (indexType === "custom") {
        const customIndexRange = document.getElementById("customIndexRange").value;
        const [min, max] = customIndexRange.split("-").map(Number);
        indexes = generateCustomIndexes(min, max, numRows);
      } else {
        indexes = Array(numRows).fill(null);
      }
  
      const columns = [];
      const data = [];
      document.getElementById("displaytable").style.display = "block";
  
      for (let i = 1; i <= columnCount; i++) {
        const columnName = document.getElementById(`column_name_${i}`).value;
        const dataType = document.getElementById(`data_type_${i}`).value;
        const dataRange = document.getElementById(`data_range_${i}`).value;
  
        if (!validateInput(columnName, dataType, dataRange)) {
          console.log(`Ошибка при генерации данных для столбца ${columnName}`);
          processMessage.style.display = "none"; // Скрываем сообщение после завершения сохранения
          return;
        }
  
        columns.push(columnName);
        const generatedData = generateData(dataType, dataRange, numRows, columnName);
        data.push(generatedData);
  
        columnMetadata[columnName] = { dataType, dataRange };
  
        // Обновление поля ввода диапазона
        // const uniqueValues = [...new Set(generatedData)];
        // document.getElementById(`data_range_${i}`).value = uniqueValues.join(", ");
  
        // Обновление типа данных на "choice", если диапазон введен через запятую
        // if (dataRange.includes(",")) {
        //     const values = dataRange.split(",").map(value => value.trim());
        //     const isRange = values.every(value => !isNaN(value));
        //     if (isRange) {
        //     document.getElementById(`data_type_${i}`).value = "choice";
        //     }
        // }  
      }
  
      if (indexType !== "none") {
        data.unshift(indexes);
        columns.unshift("index");
      }
  
      const csvContent = [columns.map(escapeCSV).join(",")]
        .concat(data[0].map((_, i) => data.map(col => escapeCSV(col[i] || "")).join(",")))
        .join("\n");
      // Сохранение данных в IndexedDB, если размер превышает ограничения localStorage
      if (csvContent.length > 5 * 1024 * 1024) {
        // 5 MB
        await saveModelToIndexedDBInParts(csvContent);
      } else {
        localStorage.setItem("csvData", csvContent);
      }
  
      displayCSVData(csvContent);
      console.log("Сгенерированные CSV данные:", csvContent);
      console.log("Сгенерированные данные:", data);
  
      updateHintSection(filename);
      processMessage.style.display = "none"; // Скрываем сообщение после завершения сохранения
    }
  }  

/**
 * Генерирует CSV данные с загруженными данными.
 * @returns {string} - Сгенерированные CSV данные.
 */
function generateCSVDataWithLoadedData() {
    const columns = [...loadedColumns];
    const data = [...loadedData];

    for (let i = 1; i <= columnCount; i++) {
        const columnName = document.getElementById(`column_name_${i}`).value;
        const dataType = document.getElementById(`data_type_${i}`).value;
        const dataRange = document.getElementById(`data_range_${i}`).value;

        if (!validateInput(columnName, dataType, dataRange)) {
            console.log(`Ошибка при генерации данных для столбца ${columnName}`);
            return;
        }

        columns.push(columnName);
        const generatedData = generateData(dataType, dataRange, loadedData.length, columnName);
        for (let j = 0; j < loadedData.length; j++) {
            data[j].push(generatedData[j]);
        }

        columnMetadata[columnName] = { dataType, dataRange };

        // Обновление поля ввода диапазона
        const uniqueValues = [...new Set(generatedData)];
        document.getElementById(`data_range_${columnCount}`).value = uniqueValues.join(", ");
    }

    const csvContent = [columns.map(escapeCSV).join(",")]
        .concat(data.map(row => row.map(escapeCSV).join(",")))
        .join("\n");
    localStorage.setItem("csvData", csvContent);

    displayCSVData(csvContent);

    console.log("Сгенерированные CSV данные:", csvContent);
    console.log("Сгенерированные данные:", data);

    // Обновляем секцию подсказок
    updateHintSection(document.getElementById('fileName').value);

    return csvContent;
}

/**
 * Генерирует пользовательские индексы с пропусками.
 * @param {number} min - Минимальное значение индекса.
 * @param {number} max - Максимальное значение индекса.
 * @param {number} numRows - Количество строк.
 * @returns {Array} - Массив сгенерированных индексов.
 */
function generateCustomIndexes(min, max, numRows) {
    const indexes = [];
    let currentIndex = min;

    for (let i = 0; i < numRows; i++) {
        if (Math.random() < 0.1) {
            indexes.push(""); // Используем пустую строку для пропущенных значений
        } else {
            if (currentIndex <= max) {
                indexes.push(currentIndex);
                currentIndex++;
            } else {
                indexes.push(""); // Используем пустую строку для пропущенных значений
            }
        }
    }

    return indexes;
}

/**
 * Генерирует данные для столбца на основе типа данных и диапазона.
 * @param {string} dataType - Тип данных.
 * @param {string} dataRange - Диапазон данных.
 * @param {number} numRows - Количество строк.
 * @param {string} columnName - Название столбца.
 * @returns {Array} - Массив сгенерированных данных.
 */
function generateData(dataType, dataRange, numRows, columnName) {
    if (dataType === "date") {
        const [startDateStr, endDateStr] = dataRange.split("-");
        const startDate = new Date(startDateStr.split(".").reverse().join("-"));
        const endDate = new Date(endDateStr.split(".").reverse().join("-"));

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            alert("Некорректный формат даты. Используйте формат ГГГГ.ММ.ДД-ГГГГ.ММ.ДД.");
            return [];
        }

        const delta = (endDate - startDate) / (1000 * 60 * 60 * 24);
        return Array.from({ length: numRows }, () => {
            const randomDate = new Date(startDate.getTime() + Math.random() * delta * 24 * 60 * 60 * 1000);
            return randomDate.toLocaleDateString("ru-RU");
        });
    } else if (dataType === "time") {
        const [startTime, endTime] = dataRange.split("-");
        return Array.from({ length: numRows }, () => generateRandomTime(startTime, endTime));
    } else if (dataType === "float_range") {
        const [start, end] = dataRange.split("-").map(Number);
        return Array.from({ length: numRows }, () => Math.random() * (end - start) + start);
    } else if (dataType === "integer_range") {
        const [start, end] = dataRange.split("-").map(Number);
        return Array.from({ length: numRows }, () => Math.floor(Math.random() * (end - start + 1)) + start);
    } else if (dataType === "range_negative") {
        const [startStr, endStr] = dataRange.split(",").map((str) => str.trim());
        const start = Number(startStr);
        const end = Number(endStr);
        return Array.from({ length: numRows }, () => Math.floor(Math.random() * (end - start + 1)) + start);
    } else if (dataType === "choice") {
        const dataList = dataRange.split(",");
        return Array.from({ length: numRows }, () => dataList[Math.floor(Math.random() * dataList.length)]);
    } else if (dataType === "boolean") {
        return Array.from({ length: numRows }, () => Math.random() < 0.5 ? "true" : "false");
    } else if (dataType === "name") {
        if (!namesData) {
            alert("Данные имен не загружены.");
            return [];
        }
        const { maleFirstNames, femaleFirstNames, maleLastNames, femaleLastNames } = namesData;
        return Array.from({ length: numRows }, () => {
            const isMale = Math.random() < 0.5;
            const firstName = isMale ? maleFirstNames[Math.floor(Math.random() * maleFirstNames.length)] : femaleFirstNames[Math.floor(Math.random() * femaleFirstNames.length)];
            const lastName = isMale ? maleLastNames[Math.floor(Math.random() * maleLastNames.length)] : femaleLastNames[Math.floor(Math.random() * femaleLastNames.length)];
            return `${firstName} ${lastName}`;
        });
    } else if (dataType === "phone") {
        return Array.from({ length: numRows }, () => generatePhoneNumber());
    } else if (dataType === "email") {
        return Array.from({ length: numRows }, () => generateEmail());
    } else if (dataType === "random") {
        return Array.from({ length: numRows }, () => Math.random());
    } else if (dataType === "fromloadcsv") {
        return Array.from({ length: numRows }, (_, i) => csvData[i][columnName]);
    } else if (dataType === "") {
        alert("Сначала создайте CSV данные.");
        return [];
    } else {
        throw new Error("Неверный формат данных");
    }
}

/**
 * Генерирует случайное время в заданном диапазоне.
 * @param {string} startTime - Начальное время.
 * @param {string} endTime - Конечное время.
 * @returns {string} - Сгенерированное время.
 */
function generateRandomTime(startTime, endTime) {
    const [startHours, startMinutes, startSeconds] = startTime.split(":").map(Number);
    const [endHours, endMinutes, endSeconds] = endTime.split(":").map(Number);

    const startTotalSeconds = startHours * 3600 + startMinutes * 60 + startSeconds;
    const endTotalSeconds = endHours * 3600 + endMinutes * 60 + endSeconds;

    const randomTotalSeconds = Math.floor(Math.random() * (endTotalSeconds - startTotalSeconds + 1)) + startTotalSeconds;

    const hours = Math.floor(randomTotalSeconds / 3600);
    const minutes = Math.floor((randomTotalSeconds % 3600) / 60);
    const seconds = randomTotalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Генерирует случайный номер телефона.
 * @returns {string} - Сгенерированный номер телефона.
 */
function generatePhoneNumber() {
    const phoneNumber = "+7" + Math.floor(Math.random() * 10000000000).toString().padStart(10, "0");
    return phoneNumber;
}

/**
 * Генерирует случайный email.
 * @returns {string} - Сгенерированный email.
 */
function generateEmail() {
    const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];
    const username = Math.random().toString(36).substring(2, 10);
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${username}@${domain}`;
}

/**
 * Валидирует ввод для столбца.
 * @param {string} columnName - Название столбца.
 * @param {string} dataType - Тип данных.
 * @param {string} dataRange - Диапазон данных.
 * @returns {boolean} - Результат валидации.
 */
function validateInput(columnName, dataType, dataRange) {
    if (!columnName) {
        alert("Название столбца не может быть пустым.");
        return false;
    }
    if (!dataType) {
        alert("Тип данных не может быть пустым.");
        return false;
    }
    if (dataType === "float_range" || dataType === "integer_range" || dataType === "range_negative" || dataType === "choice" || dataType === "time" || dataType === "date") {
        if (!dataRange) {
            alert("Диапазон данных не может быть пустым.");
            return false;
        }
        if (dataType === "float_range" || dataType === "integer_range") {
            const [start, end] = dataRange.split("-").map(Number);
            if (isNaN(start) || isNaN(end) || start >= end) {
                alert("Некорректный диапазон данных.");
                return false;
            }
        } else if (dataType === "range_negative") {
            const [startStr, endStr] = dataRange.split(",").map(str => str.trim());
            const start = Number(startStr);
            const end = Number(endStr);
            if (isNaN(start) || isNaN(end) || start >= end) {
                alert("Некорректный диапазон данных.");
                return false;
            }
        } else if (dataType === "choice") {
            const dataList = dataRange.split(",").map(str => str.trim());
            if (dataList.length < 2) {
                alert("Диапазон данных должен содержать как минимум два значения.");
                return false;
            }
        } else if (dataType === "date") {
            const dateRegex = /^\d{2}\.\d{2}\.\d{4}-\d{2}\.\d{2}\.\d{4}$/;
            if (!dateRegex.test(dataRange)) {
                alert("Некорректный формат даты. Используйте формат ДД.ММ.ГГГГ-ДД.ММ.ГГГГ");
                return false;
            }
            const [startDateStr, endDateStr] = dataRange.split("-");
            const startDate = new Date(startDateStr.split(".").reverse().join("-"));
            const endDate = new Date(endDateStr.split(".").reverse().join("-"));
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
                alert("Некорректный диапазон дат.");
                return false;
            }
        } else if (dataType === "time") {
            const timeRegex = /^\d{2}:\d{2}:\d{2}-\d{2}:\d{2}:\d{2}$/;
            if (!timeRegex.test(dataRange)) {
                alert("Некорректный формат времени. Используйте формат ЧЧ:ММ:СС-ЧЧ:ММ:СС.");
                return false;
            }
            const [startTime, endTime] = dataRange.split("-");
            const startParts = startTime.split(":").map(Number);
            const endParts = endTime.split(":").map(Number);
            if (startParts.length !== 3 || endParts.length !== 3) {
                alert("Некорректный формат времени. Используйте формат ЧЧ:ММ:СС-ЧЧ:ММ:СС.");
                return false;
            }
            const startTotalSeconds = startParts[0] * 3600 + startParts[1] * 60 + startParts[2];
            const endTotalSeconds = endParts[0] * 3600 + endParts[1] * 60 + endParts[2];
            if (startTotalSeconds >= endTotalSeconds) {
                alert("Некорректный диапазон времени.");
                return false;
            }
        }
    }
    return true;
}

/**
 * Отображает CSV данные в таблице.
 * @param {string} csvContent - Содержимое CSV.
 */
function displayCSVData(csvContent) {
    const csvLines = csvContent.split("\n");
    const table = document.createElement("table");
    const tableBody = document.createElement("tbody");
    tableBody.innerHTML = "";

    const headers = csvLines[0].split(",");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => {
        const th = document.createElement("th");
        th.textContent = header || "null";
        headerRow.appendChild(th);
    });
    tableBody.appendChild(headerRow);

    const rowsPerPage = 30;
    const totalPages = Math.ceil((csvLines.length - 1) / rowsPerPage); // Исключаем шапку

    for (let i = 1; i <= rowsPerPage && i < csvLines.length; i++) { // Начинаем с 1, чтобы пропустить шапку
        const row = document.createElement("tr");
        const cells = csvLines[i].split(",");
        console.log(`Строка ${i}:`, cells);
        cells.forEach((cell, index) => {
            const td = document.createElement("td");
            const trimmedCell = cell.trim().replace(/"/g, "");
            console.log(`Ячейка ${index} перед обрезкой:`, cell); // Отладочное сообщение
            console.log(`Ячейка ${index} после обрезки:`, trimmedCell); // Отладочное сообщение

            // Проверяем, является ли значение пустым (пустая строка, null, undefined)
            if (trimmedCell === '' || trimmedCell === 'undefined' || trimmedCell === 'null' || trimmedCell === 'NaN') {
                td.textContent = "NaN";
            } else {
                td.textContent = trimmedCell;
            }
            // Дополнительная проверка для значений 0 и false

            if (trimmedCell === '0' || trimmedCell === 'false') {
                console.log(`Ячейка ${index} равна 0 или false:`, trimmedCell);
            }

            row.appendChild(td);
        });
        tableBody.appendChild(row);
    }

    table.appendChild(tableBody);

    const displayTableElement = document.getElementById("displaytable");
    if (displayTableElement) {
        displayTableElement.innerHTML = "";
        displayTableElement.appendChild(table);
        displayTableElement.style.display = "block";
    } else {
        console.error("Элемент с id 'displaytable' не найден");
    }

    const paginationContainer = document.getElementById("pagination__container");
    if (paginationContainer) {
        paginationContainer.innerHTML = "";

        const totalPagesInfo = document.createElement("div");
        totalPagesInfo.className = "pagination__text";
        totalPagesInfo.textContent = `Всего страниц: ${totalPages}`;
        paginationContainer.appendChild(totalPagesInfo);

        const prevButton = document.createElement("button");
        prevButton.textContent = "<";
        prevButton.className = "pagination__button";
        prevButton.addEventListener("click", () => {
            const currentPage = parseInt(paginationContainer.getAttribute("data-current-page"), 10);
            if (currentPage > 1) {
                displayPage(csvLines, currentPage - 1, rowsPerPage);
            }
        });
        paginationContainer.appendChild(prevButton);

        const pageButtonsContainer = document.createElement("div");
        pageButtonsContainer.className = "page-buttons-container";

        const currentPage = parseInt(paginationContainer.getAttribute("data-current-page"), 10) || 1;
        const startPage = Math.max(1, Math.floor((currentPage - 1) / 10) * 10 + 1);
        const endPage = Math.min(totalPages, startPage + 9);

        for (let i = startPage; i <= endPage; i++) {
            const button = document.createElement("button");
            button.textContent = i;
            button.className = "pagination__button";
            button.addEventListener("click", () => {
                displayPage(csvLines, i, rowsPerPage);
            });
            pageButtonsContainer.appendChild(button);
        }

        paginationContainer.appendChild(pageButtonsContainer);

        const nextButton = document.createElement("button");
        nextButton.textContent = ">";
        nextButton.className = "pagination__button";
        nextButton.addEventListener("click", () => {
            const currentPage = parseInt(paginationContainer.getAttribute("data-current-page"), 10);
            if (currentPage < totalPages) {
                displayPage(csvLines, currentPage + 1, rowsPerPage);
            }
        });
        paginationContainer.appendChild(nextButton);

        paginationContainer.setAttribute("data-current-page", "1");
    } else {
        console.error("Элемент с id 'pagination__container' не найден");
    }
}

/**
 * Отображает определенную страницу CSV данных.
 * @param {Array} csvLines - Строки CSV.
 * @param {number} page - Номер страницы.
 * @param {number} rowsPerPage - Количество строк на странице.
 */
function displayPage(csvLines, page, rowsPerPage) {
    const startIndex = (page - 1) * rowsPerPage + 1;
    const endIndex = Math.min(startIndex + rowsPerPage, csvLines.length);

    const tableBody = document.createElement("tbody");
    for (let i = startIndex; i < endIndex; i++) {
        const row = document.createElement("tr");
        const cells = csvLines[i].split(",");
        cells.forEach((cell, index) => {
            const td = document.createElement("td");
            const trimmedCell = cell.trim().replace(/"/g, "");
            if (trimmedCell === '' || trimmedCell === 'undefined' || trimmedCell === 'null') {
                td.textContent = "NaN";
            } else {
                td.textContent = trimmedCell;
            }
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    }

    const table = document.createElement("table");
    table.appendChild(tableBody);

    const displayTableElement = document.getElementById("displaytable");
    if (displayTableElement) {
        displayTableElement.innerHTML = "";
        displayTableElement.appendChild(table);
    } else {
        console.error("Элемент с id 'displaytable' не найден");
    }

    const paginationContainer = document.getElementById("pagination__container");
    if (paginationContainer) {
        paginationContainer.setAttribute("data-current-page", page);
    } else {
        console.error("Элемент с id 'pagination__container' не найден");
    }
}

/**
 * Очищает таблицу и сбрасывает форму.
 */
function clearTable() {
    const displaytable = document.getElementById("displaytable");

    if (!displaytable) {
        console.error('Элемент с ID "displaytable" не найден');
        return;
    }

    displaytable.innerHTML = "";
    displaytable.style.display = "none";

    clearIndexedDB();
    localStorage.removeItem("csvData");

    const paginationContainer = document.getElementById("pagination__container");
    if (paginationContainer) {
        paginationContainer.innerHTML = "";
    }

    document.getElementById("num_rows").value = "";
    document.getElementById("filename").value = "";
    document.getElementById("indexType").value = "none";

    const columnsContainer = document.getElementById("columns");
    columnsContainer.innerHTML = "";
    columnCount = 0;

    // Очистка и скрытие поля для ввода пользовательского диапазона индексов
    const customIndexRange = document.getElementById("customIndexRange");
    customIndexRange.value = "";
    customIndexRange.style.display = "none";
}

/**
 * Сохраняет CSV данные в файл.
 */
async function saveCSV() {
  let csvContent = localStorage.getItem("csvData");
  if (!csvContent) {
    // Если данных нет в localStorage, загружаем их из IndexedDB
    csvContent = await loadModelFromIndexedDB();
    if (!csvContent) {
      alert("Сначала создайте или загрузите CSV данные.");
      return;
    }
  }

  const processMessage = document.getElementById("processMessage");
  const messageBox = processMessage.querySelector(".message-box");
  
  // Устанавливаем текст сообщения
  messageBox.textContent = "Сохраняем данные... Пожалуйста, подождите.";
  
  // Отображаем контейнер
  processMessage.style.display = "flex";

  const filename = document.getElementById("filename").value + ".csv";

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log("Сохранено CSV содержимое:", csvContent);
  processMessage.style.display = "none"; // Скрываем сообщение после завершения сохранения
}

/**
 * Обрабатывает загрузку CSV файла.
 * @param {Event} event - Событие загрузки файла.
 */
async function handleCSVFile(event) {
  const file = event.target.files[0];
  const errorMessages = document.getElementById("errorMessages");
  errorMessages.innerHTML = "";

  if (file) {
    const processMessage = document.getElementById("processMessage");
    const messageBox = processMessage.querySelector(".message-box");
    
    // Устанавливаем текст сообщения
    messageBox.textContent = "Загружаем данные... Пожалуйста, подождите.";
    
    // Отображаем контейнер
    processMessage.style.display = "flex";

    Papa.parse(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: false, // Не пропускать пустые строки
      complete: async function (results) {
        csvData = results.data;
        let columns = Object.keys(csvData[0]);

        // Проверка и присвоение имен пустым заголовкам
        columns = columns.map(
          (column, index) => column.trim() || `Column_${index + 1}`
        );

        document.getElementById("columns").innerHTML = "";
        columnCount = 0;

        columns.forEach((columnName) => {
          const dataType =
            columnMetadata[columnName]?.dataType || "fromloadcsv";
          const dataRange = csvData
            .map((row) => row[columnName])
            .filter((value, index, self) => self.indexOf(value) === index)
            .join(", ");
          addColumn(columnName, dataType, dataRange);

          // Обновление поля ввода диапазона
          const uniqueValues = [
            ...new Set(csvData.map((row) => row[columnName]))
          ];
          document.getElementById(`data_range_${columnCount}`).value =
            uniqueValues.join(", ");
        });

        // Удаляем кавычки из данных
        csvData.forEach((row) => {
          for (let key in row) {
            if (typeof row[key] === "string") {
              row[key] = row[key].replace(/"/g, "");
            }
          }
        });

        // Обработка пустых значений
        csvData.forEach((row) => {
          for (let key in row) {
            if (row[key] === "") {
              row[key] = ""; // Замена пустых значений на пустую строку
            }
          }
        });

        // Удаление пустых строк
        csvData = csvData.filter((row) =>
          Object.values(row).some(
            (value) => value !== null && value !== undefined && value !== ""
          )
        );

        // Проверка на наличие ошибок
        let hasErrors = false;
        let errorReport = "Обнаружены следующие ошибки в файле:\n";

        csvData.forEach((row, rowIndex) => {
          let rowErrors = [];
          Object.keys(row).forEach((key) => {
            if (
              row[key] === "" ||
              row[key] === null ||
              row[key] === undefined
            ) {
              rowErrors.push(`Пустое значение в столбце "${key}"`);
            }
          });
          if (rowErrors.length > 0) {
            hasErrors = true;
            errorReport += `Строка ${rowIndex + 1}: ${rowErrors.join(", ")}\n`;
          }
        });

        if (hasErrors) {
          alert(errorReport);
        }

        const csvContent = Papa.unparse(csvData);
        const maxLocalStorageSize = 5 * 1024 * 1024; // 5 MB

        if (csvContent.length < maxLocalStorageSize) {
          // Если данные меньше 5 MB, сохраняем в localStorage
          localStorage.setItem("csvData", csvContent);
          alert("CSV данные сохранены в localStorage");
        } else {
          // Если данные больше 5 MB, сохраняем в IndexedDB частями
          await saveModelToIndexedDBInParts(csvContent);
          alert("CSV данные сохранены в IndexedDB");
        }

        displayCSVData(csvContent);

        isCSVLoaded = true;

        // Обновление полей формы
        document.getElementById("num_rows").value = csvData.length;
        document.getElementById("filename").value = file.name.replace(
          ".csv",
          ""
        );

        updateHintSection(file.name);
        console.log("Загружен CSV Data:", csvData);

        // Аналитика
        const totalRowsdata = csvData.length;
        const totalColumns = Object.keys(csvData[0]).length;
        let emptyRows = 0;
        let missingValues = 0;
        let nullValues = 0;
        let undefinedValues = 0;
        let nanValues = 0;

        csvData.forEach((row) => {
          if (Object.values(row).every((value) => value === "")) {
            emptyRows++;
          }
          Object.values(row).forEach((value) => {
            if (value === null) nullValues++;
            if (value === undefined) undefinedValues++;
            if (value === "" || value === "NaN") nanValues++;
            if (
              value === "" ||
              value === null ||
              value === undefined ||
              value === "NaN"
            ) {
              missingValues++;
            }
          });
        });
        const analyticsContent = `
            <p>Общее количество строк: ${totalRowsdata}</p>
            <p>Общее количество столбцов: ${totalColumns}</p>
            <p>Пустые строки: ${emptyRows}</p>
            <p>Пропущенные значения: ${missingValues}</p>
            <p>NULL значения: ${nullValues}</p>
            <p>Неопределенные значения: ${undefinedValues}</p>
            <p>NaN-значения: ${nanValues}</p>
        `;
        document.getElementById("analyticsContent").innerHTML =
          analyticsContent;
        processMessage.style.display = "none"; // Скрываем сообщение в случае ошибки
      },
      error: function (error, file) {
        errorMessages.innerHTML = `Ошибка парсинга: ${error.message}`;
        console.error("Ошибка парсинга:", error);
      }
    });
  }
}
/**
 * Обновляет секцию подсказок для Jupyter Notebook и Google Colab.
 * @param {string} filename - Имя файла.
 */
function updateHintSection(filename) {
    const hintCode = `
Основные функции (пример)
# Импорт необходимых библиотек
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error
import io

# Загрузка данных
from google.colab import files
uploaded = files.upload()

# Чтение загруженного CSV файла df = pd.read_csv('sample_data/name_file.csv', encoding='utf-8')
print(df.head())
filename = list(uploaded.keys())[0]
df = pd.read_csv(io.BytesIO(uploaded[filename]))

# Получаем размеры данных (количество строк и столбцов)
print("Размеры данных:", df.shape)

# Выводим информацию о данных, включая типы данных и количество непустых значений
print(df.info())

# Получаем список всех столбцов в данных
print("Столбцы данных:", df.columns)

# Выводим статистическое описание данных, включая среднее значение, стандартное отклонение и т.д.
print(df.describe())

# Просмотр первых строк данных
print(df.head())

# Проверка на наличие пропусков
print("Проверка на наличие пропусков:")
print(df.isnull().sum())

# Удаление дубликатов (если есть)
duplicate_count = df.duplicated().sum()
if duplicate_count > 0:
    df = df.drop_duplicates()
    print(f"Удалено {duplicate_count} дубликатов")

# Подсчет уникальных значений в каждом столбце
unique_counts = df.nunique()
print("Уникальные значения в каждом столбце:")
print(unique_counts)

# Статистическая сводка
print("Статистическая сводка:")
print(df.describe(include='all'))

# Корреляционная матрица (если есть числовые данные)
if df.select_dtypes(include=['number']).shape[1] > 0:
    correlation_matrix = df.corr()
    print("Корреляционная матрица:")
    print(correlation_matrix)

# Визуализация данных
# Гистограммы для числовых данных
df.select_dtypes(include=['number']).hist(bins=30, figsize=(20, 15))
plt.show()

# Тепловая карта корреляций
if df.select_dtypes(include=['number']).shape[1] > 0:
    sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm')
    plt.show()

# Распределение категориальных данных
for column in df.select_dtypes(include=['object']).columns:
    plt.figure(figsize=(10, 5))
    sns.countplot(y=column, data=df)
    plt.title(f'Распределение {column}')
    plt.show()

# Предварительная обработка данных
# Заполнение пропущенных значений средним значением соответствующих столбцов
df.fillna(df.mean(), inplace=True)

# Преобразование категориальных признаков
categorical_cols = df.select_dtypes(include=['object']).columns
df_encoded = df.copy()

# Используем OneHotEncoder для категориальных признаков
encoder = OneHotEncoder(sparse=False, drop='first')
encoded_cols = encoder.fit_transform(df_encoded[categorical_cols])
encoded_df = pd.DataFrame(encoded_cols, columns=encoder.get_feature_names_out(categorical_cols))

# Заменяем категориальные признаки на их числовые эквиваленты
df_encoded = df_encoded.drop(categorical_cols, axis=1)
df_encoded = pd.concat([df_encoded, encoded_df], axis=1)

# Нормализация данных
scaler = StandardScaler()
df_scaled = scaler.fit_transform(df_encoded.select_dtypes(include=['number']))

# Разделение данных на обучающую и тестовую выборки
X = df_scaled
y = df_scaled  # В данном примере используем те же данные для целевых значений
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Создание и обучение модели
model = tf.keras.Sequential([
    tf.keras.layers.Dense(128, activation='relu', input_shape=(X_train.shape[1],)),
    tf.keras.layers.Dense(X_train.shape[1], activation='linear')
])

model.compile(optimizer='adam', loss='mean_squared_error', metrics=['mae'])

history = model.fit(X_train, y_train, epochs=10, batch_size=32, validation_split=0.2)

# Прогнозирование
y_pred = model.predict(X_test)

# Оценка модели
mae = mean_absolute_error(y_test, y_pred)
mse = mean_squared_error(y_test, y_pred)
print(f"MAE: {mae}")
print(f"MSE: {mse}")

# Визуализация прогнозов
plt.figure(figsize=(10, 5))
plt.plot(y_test[0], label='True')
plt.plot(y_pred[0], label='Predicted')
plt.legend()
plt.show()

`;
    document.getElementById("hintCode").textContent = hintCode;
}

/**
 * Присваивает уникальные номера текстовым значениям в столбце.
 * @param {Array} columnData - Данные столбца.
 * @returns {Object} - Объект с уникальными номерами и обновленными данными столбца.
 */
function assignUniqueNumbers(columnData) {
  const uniqueValues = [...new Set(columnData)];
  const valueToNumber = {};
  let numberToValue = {};
  let uniqueNumber = 1;

  uniqueValues.forEach(value => {
      if (value !== "" && value !== "NaN") {
          valueToNumber[value] = uniqueNumber;
          numberToValue[uniqueNumber] = value;
          uniqueNumber++;
      }
  });

  const updatedColumnData = columnData.map(value => valueToNumber[value] || value);

  return { valueToNumber, numberToValue, updatedColumnData };
}

/**
 * Анализирует данные в указанном столбце CSV.
 * @param {string} columnName - Название столбца для анализа.
 * @returns {Promise<Object>} - Возвращает промис, который разрешается объектом с метриками анализа столбца.
 */
async function analyzeColumnData(columnName) {
  let csvContent = localStorage.getItem("csvData");
  if (!csvContent) {
      // Если данных нет в localStorage, загружаем их из IndexedDB
      csvContent = await loadModelFromIndexedDB();
      if (!csvContent) {
          alert("Сначала создайте или загрузите CSV данные.");
          return {
              uniqueCount: 0,
              duplicateCount: 0,
              uniqueValues: "Нет уникальных значений",
              duplicateValues: "Нет повторяющихся значений",
              missingValues: 0,
              nullValues: 0,
              undefinedValues: 0,
              nanValues: 0,
              uniqueNumbers: {},
              numberToValue: {}
          };
      }
  }

  const csvLines = csvContent.split("\n");
  const headers = csvLines[0].split(",");
  const data = csvLines.slice(1).map(line => line.split(","));

  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
      console.error(`Столбец ${columnName} не найден в данных.`);
      return {
          uniqueCount: 0,
          duplicateCount: 0,
          uniqueValues: "Нет уникальных значений",
          duplicateValues: "Нет повторяющихся значений",
          missingValues: 0,
          nullValues: 0,
          undefinedValues: 0,
          nanValues: 0,
          uniqueNumbers: {},
          numberToValue: {}
      };
  }

  const columnData = data.map(row => row[columnIndex] !== undefined ? row[columnIndex] : "");
  const valueCounts = columnData.reduce((acc, value) => {
      if (value !== "" && value !== "NaN") {
          acc[value] = (acc[value] || 0) + 1;
      }
      return acc;
  }, {});

  const uniqueValues = Object.keys(valueCounts).filter(value => valueCounts[value] === 1);
  const duplicateValues = Object.keys(valueCounts).filter(value => valueCounts[value] > 1);

  let missingValues = 0;
  let nullValues = 0;
  let undefinedValues = 0;
  let nanValues = 0;

  columnData.forEach(value => {
      if (value === null) {
          nullValues++;
      } else if (value === undefined) {
          undefinedValues++;
      } else if (value === '' || value === 'NaN') {
          nanValues++;
      }

      if (value === '' || value === null || value === undefined || value === 'NaN') {
          missingValues++;
      }
  });

  let { valueToNumber, numberToValue, updatedColumnData } = assignUniqueNumbers(columnData);

  console.log(`Анализируемый столбец: ${columnName}`);
  console.log("Данные столбца:", columnData);
  console.log("Количество значений:", valueCounts);
  console.log("Уникальные значения:", uniqueValues);
  console.log("Повторяющиеся значения:", duplicateValues);
  console.log("Пропущенные значения:", missingValues);
  console.log("NULL значения:", nullValues);
  console.log("Неопределенные значения:", undefinedValues);
  console.log("NaN-значения:", nanValues);
  console.log("Уникальные номера:", valueToNumber);
  console.log("Отображение номеров в значения:", numberToValue);

  return {
      uniqueCount: uniqueValues.length,
      duplicateCount: duplicateValues.length,
      uniqueValues: uniqueValues.join(", ") || "Нет уникальных значений",
      duplicateValues: duplicateValues.join(", ") || "Нет повторяющихся значений",
      missingValues: missingValues,
      nullValues: nullValues,
      undefinedValues: undefinedValues,
      nanValues: nanValues,
      uniqueNumbers: valueToNumber,
      numberToValue: numberToValue
  };
}

/**
 * Проверяет и запрашивает ввод данных перед генерацией CSV.
 * @returns {boolean} - Результат проверки.
 */
function checkAndPrompt() {
    const numRows = parseInt(document.getElementById("num_rows").value, 10);
    const filename = document.getElementById("filename").value;
    const indexType = document.getElementById("indexType").value;

    if (isNaN(numRows) || numRows <= 0) {
        alert("Количество строк должно быть положительным числом.");
        return false;
    }

    if (!filename) {
        alert("Имя файла не может быть пустым.");
        return false;
    }

    if (indexType === "none" && columnCount === 0) {
        alert("Введите больше данных. Нажмите кнопку Добавить столбец");
        return false;
    }

    const columnNames = [];
    for (let i = 1; i <= columnCount; i++) {
        const columnName = document.getElementById(`column_name_${i}`).value;
        if (columnNames.includes(columnName)) {
            const changeData = confirm(`"${columnName}" уже существует`);
            if (changeData) {
                return false;
            }
        }
        columnNames.push(columnName);
    }

    return true;
}

/**
 * Создает и обучает модель машинного обучения.
 * @param {Array} inputShape - Форма входных данных.
 * @param {tf.Tensor} xTrain - Тензор обучающих данных.
 * @param {tf.Tensor} yTrain - Тензор целевых данных.
 * @returns {Promise<void>} - Промис, который разрешается при успешном создании и обучении модели.
 */
async function createAndTrainModel(inputShape, xTrain, yTrain) {
  try {
      if (yTrain.shape[1] === 0) {
          throw new Error('yTrain.shape[1] не может быть равно 0');
      }

      // Определяем архитектуру модели
      model = tf.sequential();
      model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: inputShape }));
      model.add(tf.layers.dense({ units: yTrain.shape[1], activation: 'linear' }));

      // Компилируем модель
      model.compile({
          optimizer: 'adam',
          loss: 'meanSquaredError',
          metrics: ['mae']
      });

      // Обучаем модель
      await model.fit(xTrain, yTrain, {
          epochs: 10,
          batchSize: 32,
          callbacks: {
              onEpochEnd: (epoch, logs) => console.log(`Epoch ${epoch + 1}: loss = ${logs.loss}`)
          }
      });

      console.log('Модель создана и обучена успешно');
  } catch (error) {
      console.error('Ошибка создания и обучения модели:', error);
  }
}


/**
 * Анализирует частотность слов в текстовых данных.
 * @param {string} columnName - Название столбца.
 * @returns {Object} - Объект с метриками анализа частотности слов.
 */
async function analyzeWordFrequency(columnName) {
  let csvContent = localStorage.getItem("csvData");

  if (!csvContent) {
    // Если данных нет в localStorage, загружаем их из IndexedDB
    csvContent = await loadModelFromIndexedDB();
    if (!csvContent) {
      alert("Сначала создайте или загрузите CSV данные.");
      return {
        wordFrequency: {},
        totalWords: 0,
        uniqueWords: 0
      };
    }
  }
    const csvLines = csvContent.split("\n");
    const headers = csvLines[0].split(",");
    const data = csvLines.slice(1).map(line => line.split(","));

    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) {
        console.error(`Столбец ${columnName} не найден в данных.`);
        return {
            wordFrequency: {},
            totalWords: 0,
            uniqueWords: 0
        };
    }

    const columnData = data.map(row => row[columnIndex] !== undefined ? row[columnIndex] : "").join(" ").toLowerCase();

    // Use a regular expression to match words and decimal numbers
    const words = columnData.match(/\b\d+(\.\d+)?\b|\b\w+\b/g);

    const wordFrequency = words.reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
    }, {});

    const totalWords = words.length;
    const uniqueWords = Object.keys(wordFrequency).length;

    console.log(`Анализ частотности значений в столбце ${columnName}`);
    console.log("Частотность цифр и слов:", wordFrequency);
    console.log("Общее количество данных:", totalWords);
    console.log("Количество различных используемых цифр и слов:", uniqueWords);

    return {
        wordFrequency: wordFrequency,
        totalWords: totalWords,
        uniqueWords: uniqueWords
    };
}
/**
 * Построение тепловой карты корреляции.
 * @param {Array} data - Данные для построения тепловой карты.
 * @param {Array} headers - Заголовки столбцов.
 */
function buildHeatmap(data, headers) {
    // Фильтрация столбцов, содержащих только числовые значения
    const numericColumns = headers.filter(header => {
        return data.every(row => !isNaN(parseFloat(row[headers.indexOf(header)])));
    });

    const numericData = numericColumns.map(column => {
        return data.map(row => parseFloat(row[headers.indexOf(column)]));
    });

    const correlationMatrix = [];
    const numCols = numericColumns.length;

    for (let i = 0; i < numCols; i++) {
        correlationMatrix[i] = [];
        for (let j = 0; j < numCols; j++) {
            const col1 = numericData[i];
            const col2 = numericData[j];
            const correlation = calculateCorrelation(col1, col2);
            correlationMatrix[i][j] = correlation;
        }
    }

    const heatmapData = {
        z: correlationMatrix,
        x: numericColumns,
        y: numericColumns,
        type: 'heatmap',
        colorscale: 'Viridis'
    };

    const layout = {
        title: 'Тепловая карта корреляции столбцов с числовыми значениями',
        xaxis: { tickangle: -45 },
        yaxis: { tickangle: -45 },
        annotations: []
    };

    Plotly.newPlot('heatmap', [heatmapData], layout);
}
/**
 * Вычисляет корреляцию между двумя столбцами данных.
 * @param {Array} col1 - Данные первого столбца.
 * @param {Array} col2 - Данные второго столбца.
 * @returns {number} - Корреляция между столбцами.
 */
function calculateCorrelation(col1, col2) {
    const mean1 = col1.reduce((sum, val) => sum + val, 0) / col1.length;
    const mean2 = col2.reduce((sum, val) => sum + val, 0) / col2.length;

    const numerator = col1.map((val, i) => (val - mean1) * (col2[i] - mean2)).reduce((sum, val) => sum + val, 0);
    const denominator1 = col1.map(val => Math.pow(val - mean1, 2)).reduce((sum, val) => sum + val, 0);
    const denominator2 = col2.map(val => Math.pow(val - mean2, 2)).reduce((sum, val) => sum + val, 0);

    const correlation = numerator / Math.sqrt(denominator1 * denominator2);
    return correlation;
}

/**
 * Отображает аналитику данных.
 */
async function showAnalytics() {
  try {
      console.log("Начало процесса аналитики...");
      const loadingContainer = document.getElementById("loadingContainer");

      let csvContent = localStorage.getItem("csvData");
      if (!csvContent) {
          // Если данных нет в localStorage, загружаем их из IndexedDB
          csvContent = await loadModelFromIndexedDB();
          if (!csvContent) {
              alert("Сначала создайте или загрузите CSV данные.");
              loadingContainer.style.display = "none"; // Скрываем контейнер загрузки
              return;
          }
      }
      if (!loadingContainer) {
          console.error("Элемент loadingContainer не найден в документе.");
          return;
      }
      const messageBox = loadingContainer.querySelector(".message-box");
      messageBox.textContent = "Анализируем данные... Пожалуйста, подождите.";

      loadingContainer.style.display = "flex"; // Отображаем контейнер загрузки

      const parsedData = Papa.parse(csvContent, { header: true });
      // Сохраняем исходные данные
      let originalData = parsedData.data;
      const headersIndexedDB = parsedData.meta.fields;
      let metricsHeaders = headersIndexedDB.filter(header => !isNaN(Number(parsedData.data[0][header])));
      let dataDb = parsedData.data.map(row => metricsHeaders.map(header => {
          const value = Number(row[header]);
          return isNaN(value) ? null : value;
      }));
      const chunkSize = 100000; // Размер одной части
      const totalRows = dataDb.length;

      // Заполняем пропущенные значения средним значением соответствующих столбцов
      const numCols = dataDb[0].length;
      let means = Array(numCols).fill(0);
      let count = Array(numCols).fill(0);

      dataDb.forEach(row => {
          row.forEach((value, colIndex) => {
              if (value !== null) {
                  means[colIndex] += value;
                  count[colIndex]++;
              }
          });
      });

      for (let i = 0; i < totalRows; i += chunkSize) {
          const chunk = dataDb.slice(i, i + chunkSize);
          await analyzeChunk(chunk, headersIndexedDB);
      }
      // Обновляем интерфейс с результатами анализа
      // updateAnalyticsUI(headersIndexedDB, dataDb);

      means = means.map((mean, index) => count[index] > 0 ? mean / count[index] : 0);

      dataDb = dataDb.map(row => row.map((value, colIndex) => value !== null ? value : means[colIndex]));

      console.log('Обработанные данные:', dataDb);

      const numRows = dataDb.length;
      const tensorData = tf.tensor2d(dataDb, [numRows, numCols]);
      console.log('Тензор данных:', tensorData);

      const mean = tensorData.mean(0, true);
      const std = tensorData.sub(mean).square().mean(0, true).sqrt();
      const normalizedData = tensorData.sub(mean).div(std);
      console.log('Нормализованные данные:', normalizedData);

      const splitIndex = Math.floor(normalizedData.shape[0] * 0.8);
      const xTrain = normalizedData.slice([0, 0], [splitIndex, normalizedData.shape[1]]);
      const yTrain = normalizedData.slice([0, 0], [splitIndex, normalizedData.shape[1]]);
      const xTest = normalizedData.slice([splitIndex, 0], [-1, normalizedData.shape[1]]);
      console.log('Обучающие данные:', xTrain, yTrain);
      console.log('Тестовые данные:', xTest);

      if (yTrain.shape[1] === 0) {
          console.error('yTrain.shape[1] не может быть равно 0');
          return;
      }

      const inputShape = [xTrain.shape[1]];

      await createAndTrainModel(inputShape, xTrain, yTrain);

      const predictions = model.predict(xTest);
      console.log('Прогнозы:', predictions);

      const predictionsDenormalized = predictions.mul(std).add(mean);
      console.log('Денормализованные прогнозы:', predictionsDenormalized);

      const meanPredictions = predictionsDenormalized.mean(0);
      console.log('Усредненный прогноз:', meanPredictions);

      const resultsDiv = document.getElementById('results');
      resultsDiv.innerHTML = '';

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");

      const headerRow = document.createElement('tr');
      headersIndexedDB.forEach(header => {
          const th = document.createElement('th');
          th.textContent = header;
          headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      const meanPredictionsArray = meanPredictions.arraySync();
      const tr = document.createElement('tr');
      meanPredictionsArray.forEach((value, index) => {
          const td = document.createElement('td');
          const header = headersIndexedDB[index];
          const analysisResult = analyzeColumnData(header);
          let numberToValue = analysisResult.numberToValue;
          let decodedValue = numberToValue[value] ?? value.toFixed(2);
          td.textContent = decodedValue;
          tr.appendChild(td);
      });
      tbody.appendChild(tr);
      table.appendChild(thead);
      table.appendChild(tbody);
      resultsDiv.appendChild(table);

      const csvData = parsedData.data;
      const columns = Object.keys(csvData[0]);

      const filteredColumns = columns.filter(column => {
          return !isNaN(Number(csvData[0][column]));
      });

      const traces = filteredColumns.map(column => {
          return {
              x: csvData.map((row, index) => index),
              y: csvData.map(row => row[column]),
              mode: 'lines+markers',
              name: column
          };
      });

      const layoutgraph = {
          autosize: true,
          width: '100%',
          height: 400,
          margin: {
              l: 50,
              r: 50,
              b: 100,
              t: 100,
              pad: 4
          },
          title: 'График данных',
          barmode: 'group' // Группировка столбцов по категориям
      };

      Plotly.newPlot('graph', traces, layoutgraph);

      const chartDiv = document.getElementById('chart');
      chartDiv.innerHTML = '';

      const trace = {
          x: headersIndexedDB,
          y: meanPredictionsArray,
          type: 'bar',
          marker: {
              color: 'rgba(25, 103, 210, 0.8)',
              line: {
                  color: 'rgba(25, 103, 210, 1);',
                  width: 1.5
              }
          }
      };

      const layout = {
          title: 'Усредненные прогнозы',
          autosize: true,
          width: '100%',
          height: 400,
          margin: {
              l: 50,
              r: 50,
              b: 100,
              t: 100,
              pad: 4
          }
      };

      Plotly.newPlot(chartDiv, [trace], layout);

      const csvLines = csvContent.split("\n");
      const headers = csvLines[0].split(",");
      const data = csvLines.slice(1).map(line => line.split(","));
      const totalRowsdata = data.length;
      for (let i = 0; i < totalRowsdata; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          await analyzeChunk(chunk, headers);
      }
      // Обновляем интерфейс с результатами анализа
      // updateAnalyticsUI(headers, data);

      const analyticsContent = document.getElementById("analyticsContent");
      analyticsContent.innerHTML = "";

      // Добавляем метрики для аналитики в начало
      const totalColumns = headers.length;
      let emptyRows = 0;
      let missingValues = 0;
      let nullValues = 0;
      let undefinedValues = 0;
      let nanValues = 0;
      data.forEach(row => {
          if (Object.values(row).every(value => value === "")) {
              emptyRows++;
          }
          Object.values(row).forEach(value => {
              if (value === null) {
                  nullValues++;
              } else if (value === undefined) {
                  undefinedValues++;
              } else if (value === '' || value === 'NaN') {
                  nanValues++;
              }
              if (value === '' || value === null || value === undefined || value === 'NaN') {
                  missingValues++;
              }
          });
      });

      const analyticsMetrics = document.createElement("div");
      analyticsMetrics.innerHTML = `
          <p>Всего строк: ${totalRowsdata}</p>
          <p>Всего столбцов: ${totalColumns}</p>
          <p>Пустые строки: ${emptyRows}</p>
          <p>Пропущенные значения: ${missingValues}</p>
          <p>NULL значения: ${nullValues}</p>
          <p>Неопределенные значения: ${undefinedValues}</p>
          <p>NaN-значения: ${nanValues}</p>
      `;
      analyticsContent.appendChild(analyticsMetrics);

      const analyticsTable = document.createElement("table");
      const analyticsThead = document.createElement("thead");
      const analyticsTbody = document.createElement("tbody");

      // Создаем заголовок таблицы с метриками
      const analyticsMetricsRow = document.createElement("tr");
      const analyticsMetricsHeaders = [
          "Имя столбца",
          "Количество уникальных значений",
          "Уникальные значения",
          "Количество повторяющихся значений",
          "Повторяющиеся значения",
          "Пропущенные значения",
          "NULL значения",
          "Неопределенные значения",
          "NaN-значения",
          "Частотность слов",
          "Общее количество данных",
          "Количество различных используемых цифр и слов",
          "Уникальные номера"
      ];
      analyticsMetricsHeaders.forEach(header => {
          const th = document.createElement("th");
          th.textContent = header;
          th.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
          analyticsMetricsRow.appendChild(th);
      });
      analyticsThead.appendChild(analyticsMetricsRow);

      // Создаем строки для каждого столбца
      for (let i = 0; i < headers.length; i++) {
          const header = headers[i];
          try {
              const analysisResult = await analyzeColumnData(header);
              const wordFrequencyResult = await analyzeWordFrequency(header);

              console.log(`Результат анализа для столбца ${header}:`, analysisResult);
              console.log(
                  `Результат анализа частотности слов для столбца ${header}:`,
                  wordFrequencyResult
              );

              const row = document.createElement("tr");
              const th = document.createElement("th");
              th.textContent = header;
              th.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(th);

              const uniqueCountCell = document.createElement("td");
              uniqueCountCell.textContent = analysisResult.uniqueCount;
              uniqueCountCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              uniqueCountCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(uniqueCountCell);

              const uniqueValuesCell = document.createElement("td");
              uniqueValuesCell.textContent = analysisResult.uniqueValues;
              uniqueValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              uniqueValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(uniqueValuesCell);

              const duplicateCountCell = document.createElement("td");
              duplicateCountCell.textContent = analysisResult.duplicateCount;
              duplicateCountCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              duplicateCountCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(duplicateCountCell);

              const duplicateValuesCell = document.createElement("td");
              duplicateValuesCell.textContent = analysisResult.duplicateValues;
              duplicateValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              duplicateValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(duplicateValuesCell);

              const missingValuesCell = document.createElement("td");
              missingValuesCell.textContent = analysisResult.missingValues;
              missingValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              missingValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(missingValuesCell);

              const nullValuesCell = document.createElement("td");
              nullValuesCell.textContent = analysisResult.nullValues;
              nullValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              nullValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(nullValuesCell);

              const undefinedValuesCell = document.createElement("td");
              undefinedValuesCell.textContent = analysisResult.undefinedValues;
              undefinedValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              undefinedValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(undefinedValuesCell);

              const nanValuesCell = document.createElement("td");
              nanValuesCell.textContent = analysisResult.nanValues;
              nanValuesCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              nanValuesCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(nanValuesCell);

              const wordFrequencyCell = document.createElement("td");
              wordFrequencyCell.innerHTML = JSON.stringify(wordFrequencyResult.wordFrequency, null, 2);
              wordFrequencyCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              wordFrequencyCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(wordFrequencyCell);

              const totalWordsCell = document.createElement("td");
              totalWordsCell.textContent = wordFrequencyResult.totalWords;
              totalWordsCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              totalWordsCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(totalWordsCell);

              const uniqueWordsCell = document.createElement("td");
              uniqueWordsCell.textContent = wordFrequencyResult.uniqueWords;
              uniqueWordsCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              uniqueWordsCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(uniqueWordsCell);

              const uniqueNumbersCell = document.createElement("td");
              uniqueNumbersCell.innerHTML = JSON.stringify(analysisResult.uniqueNumbers, null, 2);
              uniqueNumbersCell.style.backgroundColor = "#f9f9f9"; // Цвет фона ячейки
              uniqueNumbersCell.style.verticalAlign = "top"; // Выравнивание текста по верхней границе
              row.appendChild(uniqueNumbersCell);

              analyticsTbody.appendChild(row);
          } catch (error) {
              console.error(`Ошибка при анализе столбца ${header}:`, error);
          }
      }

      analyticsTable.appendChild(analyticsThead);
      analyticsTable.appendChild(analyticsTbody);
      analyticsTable.className = "analytics-table";
      analyticsContent.appendChild(analyticsTable);

      document.getElementById("analyticsModal").style.display = "block";

      const chartContainer = document.getElementById("chartContainer");
      chartContainer.innerHTML = "";

      // Контейнер для строк с NaN значениями
      const nanRowsContainer = document.getElementById("nanRowsContainer");
      nanRowsContainer.innerHTML = "";

      headers.forEach((header, index) => {
          const columnData = data.map(row => row[index] !== undefined ? row[index] : "NULL");
          const uniqueValues = [...new Set(columnData)];

          // Сортировка данных по количеству значений
          let sortedValues = uniqueValues.map(value => ({
              value: value,
              count: columnData.filter(v => v === value).length
          })).sort((a, b) => a.count - b.count);

          const valueCounts = sortedValues.map(item => ({
              value: item.value,
              count: item.count
          }));

          const canvas = document.createElement("canvas");
          canvas.id = `chart_${index}`;
          chartContainer.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          new Chart(ctx, {
              type: 'bar',
              data: {
                  labels: valueCounts.map(vc => vc.value),
                  datasets: [{
                      label: `Количество ${header}`,
                      data: valueCounts.map(vc => vc.count),
                      backgroundColor: 'rgba(25, 103, 210, 0.8)',
                      borderColor: 'rgba(25, 103, 210, 1);',
                      borderWidth: 1
                  }]
              },
              options: {
                  scales: {
                      y: {
                          beginAtZero: true
                      }
                  }
              }
          });

          // Ищем минимальное и максимальное значение в числовых колонках
          if (uniqueValues.every(value => !isNaN(parseFloat(value)))) {
              const numericValues = columnData.map(value => parseFloat(value)).filter(value => !isNaN(value));
              const minValue = Math.min(...numericValues);
              const maxValue = Math.max(...numericValues);

              const minRows = [];
              const maxRows = [];

              // Одновременно ищем строки с минимальным и максимальным значением
              data.forEach((row, rowIndex) => {
                  const value = parseFloat(row[index]);
                  if (value === minValue) {
                      minRows.push(row);
                  }
                  if (value === maxValue) {
                      maxRows.push(row);
                  }
              });

              // Отображаем строки с минимальным значением
              if (minRows.length > 0) {
                  const minRowDiv = document.createElement("div");
                  minRowDiv.innerHTML = `<strong>Минимальное значение для ${header}:</strong>`;
                  chartContainer.appendChild(minRowDiv);

                  const minRowsTable = createTable(headers, minRows);
                  chartContainer.appendChild(minRowsTable);
              }

              // Отображаем строки с максимальным значением
              if (maxRows.length > 0) {
                  const maxRowDiv = document.createElement("div");
                  maxRowDiv.innerHTML = `<strong>Максимальное значение для ${header}:</strong>`;
                  chartContainer.appendChild(maxRowDiv);

                  const maxRowsTable = createTable(headers, maxRows);
                  chartContainer.appendChild(maxRowsTable);
              }
          }

          // Отображаем строки с NaN-значениями из исходных данных
          const nanRows = originalData.filter((row) =>
              headers.some(
                  (header) =>
                      row[header] === "NaN" ||
                      row[header] === "" ||
                      row[header] === null ||
                      row[header] === undefined
              )
          );

          const nanRowsContainer = document.getElementById("nanRowsContainer");
          nanRowsContainer.innerHTML = ""; // Очищаем контейнер перед добавлением новых данных

          if (nanRows.length > 0) {
              const nanRowsTable = document.createElement("table");
              const nanRowsThead = document.createElement("thead");
              const nanRowsTbody = document.createElement("tbody");

              const nanRowsHeaderRow = document.createElement("tr");
              headers.forEach((h) => {
                  const th = document.createElement("th");
                  th.textContent = h;
                  nanRowsHeaderRow.appendChild(th);
              });
              nanRowsThead.appendChild(nanRowsHeaderRow);

              nanRows.forEach((row) => {
                  const tr = document.createElement("tr");
                  headers.forEach((h) => {
                      const td = document.createElement("td");
                      td.textContent = row[h];
                      tr.appendChild(td);
                  });
                  nanRowsTbody.appendChild(tr);
              });

              nanRowsTable.appendChild(nanRowsThead);
              nanRowsTable.appendChild(nanRowsTbody);
              nanRowsContainer.appendChild(nanRowsTable);
          } else {
              // Создаем сообщение, если строки с NaN-значениями не найдены
              const noNanRowsMessage = document.createElement("div");
              noNanRowsMessage.textContent = "Строки с NaN-значениями не найдены.";
              noNanRowsMessage.style.color = "red";
              nanRowsContainer.appendChild(noNanRowsMessage);
          }
      });

      console.log("Анализ данных:", data);

      // Построение тепловой карты корреляции
      buildHeatmap(dataDb, headersIndexedDB);

      // Обновляем секцию подсказок
      const filename = document.getElementById("filename").value;
      updateHintSection(filename);
      console.log("Аналитика завершена: скрываем loadingContainer");
      loadingContainer.style.display = "none"; // Скрываем контейнер загрузки после завершения анализа
  } catch (error) {
      console.error("Ошибка анализа:", error);
  }
}
/**
 * Анализирует часть данных CSV.
 * @param {Array} chunk - Часть данных для анализа.
 * @param {Array} headers - Заголовки столбцов.
 * @returns {Promise<void>} - Возвращает промис, который разрешается после завершения анализа части данных.
 */
async function analyzeChunk(chunk, headers) {
  // Анализируем текущую часть данных
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    try {
      const analysisResult = await analyzeColumnData(header);
      const wordFrequencyResult = await analyzeWordFrequency(header);

      console.log(`Результат анализа для столбца ${header}:`, analysisResult);
      console.log(`Результат анализа частотности слов для столбца ${header}:`, wordFrequencyResult);

    } catch (error) {
      console.error(`Ошибка при анализе столбца ${header}:`, error);
    }
  }
}

/**
 * Создает таблицу для отображения строк.
 * @param {Array} headers - Заголовки столбцов.
 * @param {Array} rows - Строки данных.
 * @returns {HTMLTableElement} - Элемент таблицы.
 */
function createTable(headers, rows) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
          const td = document.createElement("td");
          td.textContent = cell;
          tr.appendChild(td);
      });
      tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}
/**
 * Закрывает модальное окно аналитики.
 */
function closeModal() {
    document.getElementById("analyticsModal").style.display = "none";
}

/**
 * Открывает Jupyter Notebook с предустановленным кодом для анализа CSV файла.
 */
function openJupyterNotebook() {
    const filename = document.getElementById("filename").value;
    const code = `
import pandas as pd
import io

df = pd.read_csv(io.BytesIO(uploaded['${filename}.csv']))
print(df)
    `;
    const jupyterLink = `https://jupyter.org/try?example=${encodeURIComponent(code)}`;
    window.open(jupyterLink, '_blank');
}

/**
 * Открывает Google Colab с предустановленным кодом для анализа CSV файла.
 */
function openGoogleColab() {
    const filename = document.getElementById("filename").value;
    const code = `
import pandas as pd
import io

df = pd.read_csv(io.BytesIO(uploaded['${filename}.csv']))
print(df)
    `;
    const colabLink = `https://colab.research.google.com/notebook#create=true&code=${encodeURIComponent(code)}`;
    window.open(colabLink, '_blank');
}

/**
 * Обрабатывает загрузку CSV файла.
 * @param {Event} event - Событие загрузки файла.
 */
document.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("csvFileInput")
    .removeEventListener("change", handleCSVFile);
  document
    .getElementById("csvFileInput")
    .addEventListener("change", handleCSVFile);
});
/**
 * Экспортирует данные в Excel.
 */
async function exportToExcel() {
  let csvContent = localStorage.getItem("csvData");
  if (!csvContent) {
    // Если данных нет в localStorage, загружаем их из IndexedDB
    csvContent = await loadModelFromIndexedDB();
    if (!csvContent) {
      alert("Сначала создайте или загрузите CSV данные.");
      return;
    }
  }
  const processMessage = document.getElementById("processMessage");
  const messageBox = processMessage.querySelector(".message-box");
  
  // Устанавливаем текст сообщения
  messageBox.textContent = "Сохраняем данные... Пожалуйста, подождите.";
  
  // Отображаем контейнер
  processMessage.style.display = "flex";
  
  const csvLines = csvContent.split("\n");
  const headers = csvLines[0].split(",");
  const data = csvLines.slice(1).map((line) => line.split(","));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const filename = document.getElementById("filename").value + ".xlsx";
  XLSX.writeFile(workbook, filename);
  processMessage.style.display = "none"; // Скрываем сообщение в случае ошибки
}

/**
 * Экспортирует данные в JSON.
 */
async function exportToJson() {
  let csvContent = localStorage.getItem("csvData");
  if (!csvContent) {
    // Если данных нет в localStorage, загружаем их из IndexedDB
    csvContent = await loadModelFromIndexedDB();
    if (!csvContent) {
      alert("Сначала создайте или загрузите CSV данные.");
      return;
    }
  }
  const processMessage = document.getElementById("processMessage");
  const messageBox = processMessage.querySelector(".message-box");
  
  // Устанавливаем текст сообщения
  messageBox.textContent = "Сохраняем данные... Пожалуйста, подождите.";
  
  // Отображаем контейнер
  processMessage.style.display = "flex";
  
  const csvLines = csvContent.split("\n");
  const headers = csvLines[0].split(",");
  const data = csvLines.slice(1).map((line) => line.split(","));

  const jsonData = data.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  const jsonContent = JSON.stringify(jsonData, null, 2);
  const filename = document.getElementById("filename").value + ".json";

  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  processMessage.style.display = "none"; // Скрываем сообщение в случае ошибки

  console.log("Сохранено JSON содержимое:", jsonContent);
}

/**
 * Обрабатывает событие изменения файла для сохранения CSV данных в IndexedDB и localStorage.
 * @param {Event} event - Событие изменения файла.
 */
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("csvFileInput")
    .addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const csvContent = e.target.result;
          const maxLocalStorageSize = 5 * 1024 * 1024; // 5 MB

          if (csvContent.length < maxLocalStorageSize) {
            // Если данные меньше 5 MB, сохраняем в localStorage
            localStorage.setItem("csvData", csvContent);
            //alert('CSV данные сохранены в localStorage');
          } else {
            // Если данные больше 5 MB, сохраняем в IndexedDB частями
            await saveModelToIndexedDBInParts(csvContent);
            //alert('CSV данные сохранены в IndexedDB');
          }
          if (csvData && csvData.length > 0) {
            generateCSV();
          }
        };
        reader.readAsText(file);
      }
    });
});

/**
 * Обрабатывает изменение типа индексов.
 */
document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("indexType").addEventListener("change", function () {
      const indexType = this.value;
      const customIndexRange = document.getElementById("customIndexRange");
      console.log("Выбранный тип индекса:", indexType);
      if (indexType === "custom") {
        customIndexRange.style.display = "block";
        // customIndexRange.style.border = "2px solid red"; // Временно добавляем границу для отладки
        console.log("Поле ввода пользовательских индексов отображается");
      } else {
        customIndexRange.style.display = "none";
        console.log("Поле ввода пользовательских индексов скрыто");
      }
    });
  });  
  
/**
 * Обрабатывает ввод пользователя и ищет совпадения в таблице.
 */
async function searchRows() {
  const userInput = document.getElementById("userInput").value;
  const searchValues = userInput
    .split(",")
    .map((value) => value.trim().toLowerCase());
  let csvContent = localStorage.getItem("csvData");

  if (!csvContent) {
    // Если данных нет в localStorage, загружаем их из IndexedDB
    csvContent = await loadModelFromIndexedDB();
    if (!csvContent) {
      alert("Сначала создайте или загрузите CSV данные.");
      return;
    }
  }

  const csvLines = csvContent.split("\n");
  const headers = csvLines[0].split(",");
  const data = csvLines.slice(1).map((line) => line.split(","));

  const matchingRows = data.filter((row) => {
    return searchValues.some((value) =>
      row.some((cell) => cell.toLowerCase().includes(value))
    );
  });

  const searchResultsDiv = document.getElementById("searchResults");
  searchResultsDiv.innerHTML = "";

  if (matchingRows.length > 0) {
    const totalRowsdata = data.length;
    const matchPercentage = (matchingRows.length / totalRowsdata) * 100;

    const resultsTable = document.createElement("table");
    const resultsThead = document.createElement("thead");
    const resultsTbody = document.createElement("tbody");

    const percentageDiv = document.createElement("div");
    percentageDiv.textContent = `Найдено совпадений: ${
      matchingRows.length
    } (${matchPercentage.toFixed(2)}%)`;
    percentageDiv.className = "percentage-info";

    searchResultsDiv.appendChild(percentageDiv);

    const headerRow = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      headerRow.appendChild(th);
    });
    resultsThead.appendChild(headerRow);

    matchingRows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      resultsTbody.appendChild(tr);
    });

    resultsTable.appendChild(resultsThead);
    resultsTable.appendChild(resultsTbody);
    searchResultsDiv.appendChild(resultsTable);
  } else {
    const noResultsDiv = document.createElement("div");
    noResultsDiv.textContent = "Совпадений не найдено.";
    searchResultsDiv.appendChild(noResultsDiv);
  }
}