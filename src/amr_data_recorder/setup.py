from setuptools import find_packages, setup

package_name = 'amr_data_recorder'

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=[
        (
            'share/ament_index/resource_index/packages',
            ['resource/' + package_name]
        ),
        (
            'share/' + package_name,
            ['package.xml']
        ),
    ],
    install_requires=[
        'setuptools',
    ],
    zip_safe=True,
    maintainer='vasan',
    maintainer_email='seenivasanthangarasu@gmail.com',
    description='AMR sensor data recorder using ROS 2 bags and MCAP',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'record = amr_data_recorder.record:main',
        ],
    },
)
